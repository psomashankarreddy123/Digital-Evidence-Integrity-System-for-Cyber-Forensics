# Digital Evidence Integrity Management System for Cyber Forensics

Secure forensic evidence management web application built with Node.js and browser-native UI components.

## Run

```powershell
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Credentials

- Admin: `admin-chief` / `Admin@123`
- Investigator: `investigator-01` / `Investigator@123`

## Included Features

- Separate Admin and Investigator login pages
- Signed session cookies with role-based routing
- Evidence upload with progress indicator
- Automatic SHA-256 hash generation and integrity lock status
- Encrypted evidence storage at rest
- Evidence list with search and filters
- Integrity verification with tamper alerting
- Audit trail for upload, access, verification, and failed login attempts
- Read-only download and preview support
- Print-ready audit export for PDF saving
- Responsive dark/light forensic dashboard UI
