# Patient symptom care navigation API

## Expo mobile app

The Careway mobile client and its matching API copy are in [`mobile-app/`](mobile-app/README.md). Follow that guide to run the patient and doctor interfaces in Expo Go and connect the local assistant.

This FastAPI starter supports symptom care navigation, not diagnosis. It does
not contain a medical rule set: the default policy conservatively returns
`medical_advice`. A clinician-reviewed policy can be injected with
`create_app(triage_policy=...)`. Policies may return an emergency level, a
focused follow-up question, or a care level. Emergency decisions are returned
immediately without a routine follow-up question.

Ollama classifies each message using a strict JSON schema and responds in French
to general health information, educational, and translation requests. Unrelated
topics are redirected to the health scope. It defaults to the local
`qwen3:4b` model at `http://localhost:11434`; pull it with
`ollama pull qwen3:4b`. Set `OLLAMA_MODEL` or `OLLAMA_BASE_URL` to change these.
Personalized diagnosis, treatment, or
medication requests are redirected to a healthcare professional. Emergency
rules take priority over routine classification. If model output is malformed
or Ollama is unavailable, the API conservatively returns `medical_advice`.
Ollama receives the user message to classify and answer general questions; the
API does not log raw symptom text. Do not include identifying information.

If `qwen3:4b` fails to load because of memory pressure, `qwen3:1.7b` is a
lower-memory fallback: pull it with `ollama pull qwen3:1.7b` and start the API
with `$env:OLLAMA_MODEL = "qwen3:1.7b"`. In a brief local comparison it was
slightly faster overall, but it made a questionable health explanation and
mistranslated a term, so keep `qwen3:4b` as the default when it runs reliably.
The classifier uses a 2,048-token context,
at most 192 generated tokens, disables Qwen thinking, and keeps the model loaded
for five minutes to avoid reloading between turns. Errors are categorized in
server logs without recording prompts, and the French UI gives a short message
for model, memory, timeout, and connection failures.

## Run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

The browser chat is available at `http://127.0.0.1:8000/`, and interactive API
documentation is at `/docs`. The chat keeps up to eight recent turns in the
current browser tab only; reloading clears the conversation. `GET /health` is a
basic liveness check. `POST /chat` accepts a current message and optional
conversation history:

```json
{
  "message": "Que signifie un mal de tête ?",
  "conversation": [],
  "answers": []
}
```

The older `symptoms` request field remains supported for API clients.

Responses use one of `emergency`, `medical_advice`, `self_care_information`,
`general_information`, `educational`, `translation`, or `out_of_scope` and include
a professional-care disclaimer. Unrelated requests are redirected to the health
scope. Suspected emergencies should be directed to local emergency services; no
country or emergency number is assumed. This starter does not provide medication
doses or treatment instructions.

## Doctor directory and review-only recommendations

The doctor catalogue is loaded from the UTF-8 JSON array set by `DOCTOR_DATA_PATH`. The catalogue and sentiment model are local assets and are intentionally excluded from Git; after cloning, provide your own files and set `DOCTOR_DATA_PATH` and `DOCTOR_SENTIMENT_MODEL_PATH` to their paths. For example, in PowerShell, set each variable to the full path of its file before starting the API. In this working copy, the ignored files under `data/` remain available locally. French directory fields are normalized by the repository; `lib_deleg` is used as the city when `lib_localite` is empty, and `lib_gouv` is retained as the governorate.

`GET /doctors/catalog` returns doctor cards and supports `specialty`, `city`, and `query` filters. The Expo discovery screen also provides specialty chips and a city/governorate text filter. Doctors without coordinates are not given a map pin or distance estimate.

`POST /doctors/recommendations` ranks doctors only by sentiment labels from persisted, real reviews. Specialty and city are eligibility filters; they do not affect the score. For counts `P` (positive), `U` (neutral), `N` (negative), and smoothing value `k=10`, the score is `100 * (P + 0.5*U + 0.5*k) / (P + U + N + k)`. Doctors with no real classified reviews are not ranked. Generated demonstration reviews are excluded from production scores. The TF-IDF + LogisticRegression pipeline at `DOCTOR_SENTIMENT_MODEL_PATH` classifies each submitted review. Class IDs are mapped as 0=negative, 1=neutral, 2=positive. No LLM is used for review classification; the LLM-backed health chat is separate. The model was serialized with scikit-learn 1.6.1, so both requirements files pin that version.

`POST /doctors/{doctor_id}/reviews` accepts `{"text": "..."}` and requires the `X-Review-Submission-Token` header. Set `DOCTOR_REVIEW_SUBMISSION_TOKEN` on the backend or inject it at the authenticated API gateway; never embed this shared secret in the Expo app. The endpoint classifies the text, writes the review to `data/doctor_reviews.sqlite3`, and updates that doctor's sentiment counters and ratio in one SQLite transaction. Its response includes the predicted sentiment, counts, ratio, and update time. `GET /doctors/{doctor_id}/review-score` returns the saved score. Set `DOCTOR_REVIEWS_DB_PATH` to move the database to a persistent volume. The app refreshes the directory every 30 seconds so other clients see score changes.

The previous multi-criteria AHP/TOPSIS recommender is not used by the active recommendation API. The score is based only on review sentiment output. It is a review-based recommendation ratio, not evidence of clinical quality or treatment outcomes.

The default catalogue file contains generated demo reviews and generated experience values paired with directory profiles. Do not present those review-based scores or experience values as verified facts. Replace the demo review data with appropriately sourced reviews before production use.

## Run automated tests

```powershell
python -m unittest discover -s tests -v
```

Recommendation unit and API tests use ten fictional profiles in
`tests/test_recommendations.py`. They are not loaded into the running app.
