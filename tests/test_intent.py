"""Tests for intent classification and safe API handling."""

import json
import unittest

import httpx

from app.intent import IntentClassificationError, IntentClassifier, SYSTEM_PROMPT
from app.main import create_app
from app.triage import ConservativeDefaultPolicy


CASES = {
    "What does headache mean?": ("general_information", "Une céphalée est une douleur à la tête."),
    "Give me five examples of symptoms.": ("educational", "Voici quelques exemples : douleur, toux et fatigue."),
    "Translate cough into French.": ("translation", "En français, cough se traduit par « toux »."),
    "Explain the difference between nausea and dizziness.": (
        "educational",
        "La nausée est une sensation d’inconfort à l’estomac ; les vertiges donnent une impression d’instabilité.",
    ),
    "I have a headache. What disease do I have?": ("medical_advice", ""),
    "What medication should I take for my fever?": ("medical_advice", ""),
    "Generate 10 fictional sentences containing symptoms.": (
        "educational",
        "Voici des exemples fictifs : Elle toussait. Il se sentait fatigué.",
    ),
    "What is the definition of blood pressure?": (
        "general_information",
        "La pression artérielle est la force exercée par le sang sur les parois des artères.",
    ),
    "Could this be serious?": ("medical_advice", ""),
    "I may be having an emergency; what should I do?": ("emergency", ""),
    "Who won the last World Cup?": ("out_of_scope", ""),
}


class IntentClassifierTests(unittest.IsolatedAsyncioTestCase):
    async def test_requested_intent_examples(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            user_text = payload["messages"][1]["content"]
            intent, answer = CASES[user_text]
            return httpx.Response(
                200,
                json={"message": {"content": json.dumps({"intent": intent, "answer": answer})}},
            )

        classifier = IntentClassifier(transport=httpx.MockTransport(handler))
        for prompt, (expected, _) in CASES.items():
            with self.subTest(prompt=prompt):
                result = await classifier.classify(prompt)
                self.assertEqual(result.intent, expected)

    async def test_uses_native_ollama_structured_schema_and_safety_prompt(self):
        observed = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            observed["url"] = str(request.url)
            observed["payload"] = json.loads(request.content)
            return httpx.Response(
                200,
                json={"message": {"content": '{"intent":"educational","answer":"General answer."}'}},
            )

        classifier = IntentClassifier(transport=httpx.MockTransport(handler))
        await classifier.classify("Explain symptoms generally")
        payload = observed["payload"]
        self.assertEqual(observed["url"], "http://localhost:11434/api/chat")
        self.assertEqual(payload["model"], "qwen3:4b")
        self.assertIsInstance(payload["format"], dict)
        self.assertEqual(set(payload["format"]["properties"]), {"intent", "answer"})
        self.assertNotIn("maxLength", payload["format"]["properties"]["answer"])
        self.assertIs(payload["think"], False)
        self.assertEqual(payload["options"]["num_ctx"], 2048)
        self.assertEqual(payload["options"]["num_predict"], 192)
        self.assertEqual(payload["keep_alive"], "5m")
        self.assertIn("Merely mentioning symptoms is not a medical-advice request", SYSTEM_PROMPT)
        self.assertIn("Never diagnose", SYSTEM_PROMPT)
        self.assertIn("natural French", SYSTEM_PROMPT)

    async def test_malformed_and_unexpected_responses_fail_validation(self):
        for content in ('not json', '{"intent":"other","answer":""}'):
            async def handler(request: httpx.Request, content=content) -> httpx.Response:
                return httpx.Response(200, json={"message": {"content": content}})

            classifier = IntentClassifier(transport=httpx.MockTransport(handler))
            with self.subTest(content=content), self.assertRaises(IntentClassificationError):
                await classifier.classify("Ambiguous health question")

    async def test_ollama_connection_failure_is_conservative_error(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("offline", request=request)

        classifier = IntentClassifier(transport=httpx.MockTransport(handler))
        with self.assertRaises(IntentClassificationError) as raised:
            await classifier.classify("What does a symptom mean?")
        self.assertEqual(raised.exception.kind, "server_unavailable")

    async def test_ollama_http_errors_are_categorized(self):
        cases = [
            (404, {"error": "model qwen3:4b not found"}, "model_not_installed"),
            (500, {"error": "failed to allocate CUDA_Host buffer"}, "insufficient_memory"),
            (500, {"error": "runner crashed"}, "model_runtime_error"),
        ]
        for status, body, expected_kind in cases:
            async def handler(request: httpx.Request, status=status, body=body) -> httpx.Response:
                return httpx.Response(status, json=body)

            classifier = IntentClassifier(transport=httpx.MockTransport(handler))
            with self.subTest(expected_kind=expected_kind), self.assertRaises(IntentClassificationError) as raised:
                await classifier.classify("Question de test")
            self.assertEqual(raised.exception.kind, expected_kind)

    async def test_ollama_timeout_is_categorized(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("slow response", request=request)

        classifier = IntentClassifier(transport=httpx.MockTransport(handler))
        with self.assertRaises(IntentClassificationError) as raised:
            await classifier.classify("Question de test")
        self.assertEqual(raised.exception.kind, "timeout")

    async def test_empty_informational_answer_is_rejected(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"message": {"content": json.dumps({"intent": "general_information", "answer": ""})}},
            )

        classifier = IntentClassifier(transport=httpx.MockTransport(handler))
        with self.assertRaises(IntentClassificationError) as raised:
            await classifier.classify("Question de test")
        self.assertEqual(raised.exception.kind, "invalid_response")


class ChatRouteTests(unittest.IsolatedAsyncioTestCase):
    async def _post_chat(self, intent: str, answer: str = ""):
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"message": {"content": json.dumps({"intent": intent, "answer": answer})}},
            )

        classifier = IntentClassifier(transport=httpx.MockTransport(handler))
        app = create_app(
            triage_policy=ConservativeDefaultPolicy(),
            intent_classifier=classifier,
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            return await client.post("/chat", json={"symptoms": "Test message"})

    async def test_educational_answer_is_returned_without_medical_advice_redirect(self):
        response = await self._post_chat("educational", "A general educational explanation.")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["level"], "educational")
        self.assertEqual(response.json()["message"], "A general educational explanation.")

    async def test_personalized_request_is_redirected(self):
        response = await self._post_chat("medical_advice", "unsafe model content ignored")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["level"], "medical_advice")
        self.assertNotIn("unsafe model content", response.json()["message"])

    async def test_emergency_classification_short_circuits(self):
        response = await self._post_chat("emergency", "")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["level"], "emergency")
        self.assertIn("services d’urgence locaux", response.json()["message"])

    async def test_malformed_model_response_falls_back_to_medical_advice(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"message": {"content": "not json"}})

        app = create_app(
            triage_policy=ConservativeDefaultPolicy(),
            intent_classifier=IntentClassifier(transport=httpx.MockTransport(handler)),
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/chat", json={"symptoms": "What does cough mean?"})
        self.assertEqual(response.json()["level"], "medical_advice")

    async def test_out_of_memory_error_has_clear_french_message(self):
        class MemoryErrorClassifier:
            async def classify(self, user_message, conversation=None):
                raise IntentClassificationError("insufficient_memory")

        app = create_app(
            triage_policy=ConservativeDefaultPolicy(),
            intent_classifier=MemoryErrorClassifier(),
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/chat", json={"message": "Que signifie la toux ?"})

        self.assertEqual(response.json()["level"], "medical_advice")
        self.assertIn("mémoire disponible", response.json()["message"])

    async def test_message_with_history_is_sent_as_conversation_context(self):
        observed = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            observed["prompt"] = payload["messages"][1]["content"]
            return httpx.Response(
                200,
                json={
                    "message": {
                        "content": json.dumps(
                            {"intent": "educational", "answer": "Voici une explication générale."}
                        )
                    }
                },
            )

        app = create_app(
            triage_policy=ConservativeDefaultPolicy(),
            intent_classifier=IntentClassifier(transport=httpx.MockTransport(handler)),
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/chat",
                json={
                    "message": "Can you explain more?",
                    "conversation": [
                        {"role": "user", "content": "What does headache mean?"},
                        {"role": "assistant", "content": "A headache is pain in the head."},
                    ],
                },
            )

        self.assertEqual(response.json()["level"], "educational")
        self.assertIn("What does headache mean?", observed["prompt"])
        self.assertIn("Can you explain more?", observed["prompt"])

    async def test_root_serves_interactive_chat_page(self):
        app = create_app(triage_policy=ConservativeDefaultPolicy())
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("/chat", response.text)
        self.assertIn("Assistant d’orientation santé", response.text)

    async def test_plain_greeting_does_not_call_ollama(self):
        class NeverCalledClassifier:
            async def classify(self, user_message, conversation=None):
                raise AssertionError("A plain greeting should not need a model call")

        app = create_app(
            triage_policy=ConservativeDefaultPolicy(),
            intent_classifier=NeverCalledClassifier(),
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/chat", json={"message": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["level"], "general_information")
        self.assertIn("Que souhaitez-vous savoir", response.json()["message"])

    async def test_unrelated_question_is_redirected_without_answering(self):
        response = await self._post_chat("out_of_scope", "Argentina won the tournament.")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["level"], "out_of_scope")
        self.assertNotIn("Argentina", response.json()["message"])
        self.assertIn("questions de santé", response.json()["message"])


if __name__ == "__main__":
    unittest.main()
