# AI-HealthLab mobile app

This Expo Go client contains the patient and doctor interfaces. It uses JavaScript and targets Node.js 20.20.0 with Expo SDK 54.

## Start the chatbot API

In a PowerShell terminal, set your GroqCloud key and start the API. The secure prompt avoids writing the key into PowerShell command history:

```powershell
cd mobile-app\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$secureGroqKey = Read-Host "Groq API key" -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new("", $secureGroqKey).Password
$env:GROQ_MODEL = "openai/gpt-oss-20b"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Keep this API running while using the assistant. The phone and computer must be on the same Wi-Fi. Allow Python through Windows Firewall on private networks if prompted. Groq classifies intent; the assistant does not return generated health answers. It continues with a follow-up, recommends a doctor for personal or concerning issues, and directs suspected emergencies to local emergency services. Assistant messages are processed by GroqCloud; do not send identifying or sensitive health information.

## Start Expo Go

In a second PowerShell terminal:

```powershell
cd mobile-app
npm install
npm start
```

Scan the Expo QR code with Expo Go. The mobile client connects to the API on port 8000 using the development host address.

Patient and doctor account records are stored securely on the device using Expo SecureStore. Accounts are local to that device; cross-device accounts require a production authentication service.

## Doctor directory and review-only recommendations

The doctor catalogue is loaded from the UTF-8 JSON array set by `DOCTOR_DATA_PATH`. The catalogue and sentiment model are local assets and are intentionally excluded from Git; after cloning, provide your own files and set `DOCTOR_DATA_PATH` and `DOCTOR_SENTIMENT_MODEL_PATH` to their paths before starting the backend. In this working copy, the ignored files under the repository's `data/` folder remain available locally. French directory fields are normalized by the repository; `lib_deleg` is used as the city when `lib_localite` is empty, and `lib_gouv` is retained as the governorate.

`GET /doctors/catalog` returns doctor cards and supports `specialty`, `city`, and `query` filters. The Expo discovery screen also provides specialty chips and a city/governorate text filter. Doctors without coordinates are not given a map pin or distance estimate.

`POST /doctors/recommendations` ranks doctors only by sentiment labels from persisted, real reviews. Specialty and city are eligibility filters; they do not affect the score. For counts `P` (positive), `U` (neutral), `N` (negative), and smoothing value `k=10`, the score is `100 * (P + 0.5*U + 0.5*k) / (P + U + N + k)`. Doctors with no real classified reviews are not ranked. Generated demonstration reviews are excluded from production scores. The TF-IDF + LogisticRegression pipeline at `DOCTOR_SENTIMENT_MODEL_PATH` classifies each submitted review. Class IDs are mapped as 0=negative, 1=neutral, 2=positive. No LLM is used for review classification; the LLM-backed health chat is separate. The model was serialized with scikit-learn 1.6.1, so both requirements files pin that version.

`POST /doctors/{doctor_id}/reviews` accepts `{"text": "..."}` and requires the `X-Review-Submission-Token` header. Set `DOCTOR_REVIEW_SUBMISSION_TOKEN` on the backend or inject it at the authenticated API gateway; never embed this shared secret in the Expo app. The endpoint classifies the text, writes the review to `data/doctor_reviews.sqlite3`, and updates that doctor's sentiment counters and ratio in one SQLite transaction. Its response includes the predicted sentiment, counts, ratio, and update time. `GET /doctors/{doctor_id}/review-score` returns the saved score. Set `DOCTOR_REVIEWS_DB_PATH` to move the database to a persistent volume. The app refreshes the directory every 30 seconds so other clients see score changes.

The previous multi-criteria AHP/TOPSIS recommender is not used by the active recommendation API. The score is based only on review sentiment output. It is a review-based recommendation ratio, not evidence of clinical quality or treatment outcomes.

The default catalogue file contains generated demo reviews and generated experience values paired with directory profiles. Do not present those review-based scores or experience values as verified facts. Replace the demo review data with appropriately sourced reviews before production use.
