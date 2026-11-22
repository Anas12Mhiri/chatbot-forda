# Careway mobile app

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
