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

## Doctor recommendation data API

`POST /doctors/recommendations` ranks doctor profiles using only the explicit
request and structured catalog. It does not call Ollama. The colleague's UI can
call this endpoint directly; no interface files were changed. This repository
does not include a real doctor database, so the default catalog is empty and the
endpoint returns `no_matches` until a catalog is connected. The included
synthetic profiles are confined to tests and are not production data.

For a local data source, set `DOCTOR_DATA_PATH` to a UTF-8 JSON file containing
an array of doctor objects, then start the app. The file is validated on every
request. Required fields are `doctor_id`, `name`, and `specialty`. Optional
fields are `specialties`, `subspecialties`, `phone`, `email`, `address`, paired
`latitude`/`longitude`, `experience_years`, `operations_count`,
`operation_specialties`, `average_rating`, `review_count`, `biography`, and
`education`. Education entries use `title`, `level` (`specialist`,
`postgraduate`, `certification`, or `general`), optional `specialty`, and
`verified`. Do not add patient information to doctor records.

```powershell
$env:DOCTOR_DATA_PATH = "E:\data\doctors.json"
$env:OLLAMA_MODEL = "qwen3:1.7b" # Optional; this does not affect rankings.
uvicorn app.main:app --reload
```

Example request (the patient supplies specialty and any location; the API never
guesses either):

```json
{
  "patient_query": "Je cherche un cardiologue pour les troubles du rythme",
  "specialty": "cardiologie",
  "latitude": 36.8,
  "longitude": 10.18,
  "count": 3,
  "criterion_preferences": {"location": 0.3, "biography": 0.7}
}
```

With the default empty catalog, the response is explicitly:

```json
{
  "status": "no_matches",
  "recommendations": [],
  "unranked_profiles": [],
  "algorithm": {
    "method": "AHP-TOPSIS",
    "weights_source": "baseline",
    "weights": {},
    "consistency_ratio": null,
    "maximum_eigenvalue": null,
    "consistency_index": null,
    "note": "Le score mesure l’adéquation du profil aux critères fournis; il ne prouve pas une supériorité médicale ni un résultat clinique et ne remplace pas un avis médical. En cas d’urgence présumée, contactez les services d’urgence locaux."
  },
  "excluded_for_insufficient_information": 0,
  "message": "Aucune correspondance de spécialité n’a été trouvée."
}
```

If location is omitted, the location criterion is removed and the remaining
weights are renormalized. Doctors are eligible only when a configured specialty
label or synonym matches. If no doctor is eligible, the response has
`status: "no_matches"`; if eligible profiles have no usable ranking data, it
has `status: "insufficient_information"`. Missing individual values are
median-imputed for TOPSIS (neutral rather than zero), named in
`missing_information`, and never presented as known facts. Profiles below the
minimum are listed in `unranked_profiles`, with their unavailable fields.
Missing criteria
across the whole candidate set are excluded and the effective weights are
renormalized. At least two scored criteria are required for a profile to be
ranked (configurable with `minimum_scored_criteria`); otherwise the API returns
`insufficient_information` or counts that profile as excluded. Operations count
only when the profile identifies the operation specialty. Review score is a
Bayesian average, not a measure of clinical success.

### Method and configurable parameters

The pure mathematical implementation is in `app/recommendation_engine.py`;
the API schemas, repository boundary, and route are in
`app/recommendation_schemas.py`, `app/doctor_repository.py`, and
`app/recommendation_routes.py`. `create_app()` accepts a `doctor_repository`
and `recommendation_engine`, so an adapter for the colleague's database can
implement `DoctorRepository.list_doctors()` without changing the ranking code.

The initial fixed baseline weights are location 0.15, experience 0.20,
operations 0.10, reviews 0.25, biography 0.20, and education 0.10. They are
configurable but are not clinically validated. The engine uses:

- Location: Haversine distance with earth radius 6,371 km, then
  `exp(-distance_km / k)` (`k=10` by default).
- Experience: `min(years / Y_max, 1)` (`Y_max=20`).
- Relevant operations: `min(count / O_max, 1)` (`O_max=500`); counts without
  operation-specialty metadata are unavailable.
- Reviews: `(n * doctor_average + m * evaluated_population_average) / (n + m)`,
  then divided by 5 (`m=20`). Doctors without reviews have no review score.
- Biography match: configurable weighted combination of specialty taxonomy
  overlap and standard-library TF-IDF/cosine similarity (default 0.5 each).
  The starter taxonomy is intentionally small and configurable, not a clinical
  ontology; supported matching language follows the current French/English UI.
- Education: only verified, specialty-matched qualifications count. Levels
  score specialist 1.0, postgraduate 0.75, certification 0.5, and general 0.25.
  Institution reputation is not used. These scoring constants are configurable
  in code and are not quality or outcome claims.

All criteria are converted to benefit scores in [0,1]. TOPSIS vector-normalizes
the decision matrix, applies effective weights, derives positive/negative
ideals, computes Euclidean distances, and returns `D- / (D+ + D-)`. A tie is
broken by normalized doctor name and then ID. Per-request `criterion_preferences`
can supply nonnegative relative weights; they are normalized over available
criteria.

For AHP mode, configure `RecommendationSettings(weight_mode="ahp",
pairwise_comparisons=...)`. Matrix order is location, experience, operations,
reviews, biography, education. Values follow the reciprocal Saaty 1..9 scale;
the engine calculates and exposes lambda-max, CI, and CR in the API,
and rejects `CR >= 0.10` with HTTP 422 so comparisons can be revised. Baseline
weights remain the default and are reported as `weights_source: "baseline"`;
they are not claimed to have been derived by AHP.

Every score is a profile-match score for the supplied preferences, not proof
that a doctor is medically superior or that a clinical outcome is likely. The
API does not infer a specialty from symptoms or provide medical advice.

## Run automated tests

```powershell
python -m unittest discover -s tests -v
```

Recommendation unit and API tests use ten fictional profiles in
`tests/test_recommendations.py`. They are not loaded into the running app.
