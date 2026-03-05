# HIPAA Compliance — MedClaim

> **Status:** In progress — MVP-level compliance
> **Last updated:** March 4, 2026
> **Owner:** Daniel Reimer

---

## Overview

MedClaim handles Protected Health Information (PHI) including medical bills,
insurance plan details, diagnosis codes (ICD-10), procedure codes (CPT/HCPCS),
and financial data. HIPAA compliance is required.

**Key fact:** HIPAA is self-attestation. There is no official government
certification. HHS/OCR investigates after breaches or complaints, not
proactively. Fines range from $100–$50,000 per violation.

---

## The Four Buckets

### 1. ✅ Policies & Procedures (documentation)

| Document                  | Status    | Location                    |
| ------------------------- | --------- | --------------------------- |
| Access Control Policy     | ⬜ TODO   | `compliance/policies/`      |
| Incident Response Plan    | ⬜ TODO   | `compliance/policies/`      |
| Risk Assessment           | ✅ Draft  | `compliance/RISK_ASSESSMENT.md` |
| Employee Training Policy  | ⬜ TODO   | `compliance/policies/`      |
| Data Retention Policy     | ⬜ TODO   | `compliance/policies/`      |
| BAA Policy / Vendor List  | ✅ Draft  | `compliance/BAA_VENDORS.md` |

> 💡 **Tip:** Buy policy templates ($500-$1,000) from Compliancy Group or
> Accountable HQ rather than writing from scratch.

### 2. ✅ Audit Logging (technical — IMPLEMENTED)

Every PHI access is logged to the `audit_logs` table:

| Field           | Description                              |
| --------------- | ---------------------------------------- |
| `user_id`       | Who accessed the data                    |
| `user_email`    | Denormalized for fast reads              |
| `guest_id`      | For unauthenticated guest actions        |
| `action`        | view / create / update / delete / export / login / login_fail / upload / download |
| `resource_type` | case / document / insurance_plan / user / auth |
| `resource_id`   | The specific record accessed             |
| `ip_address`    | Client IP (IPv4 or IPv6)                 |
| `user_agent`    | Browser / client identifier              |
| `endpoint`      | Full HTTP method + path                  |
| `metadata_json` | Fields changed, search terms, etc.       |
| `created_at`    | UTC timestamp                            |

**Implementation:**
- Model: `backend/app/models/models.py` → `AuditLog`
- Service: `backend/app/core/audit.py` → `log_action()`, `log_from_request()`
- Middleware: Auto-logs all PHI-touching API requests
- Explicit logging: Login success/failure, registration
- Admin viewer: `GET /api/admin/audit-logs` (filterable, paginated)
- Admin stats: `GET /api/admin/audit-logs/stats`

**Retention:** Keep forever (minimum 6 years per HIPAA §164.530(j)).

### 3. 🔧 Infrastructure Security

| Requirement                   | Status    | Details                           |
| ----------------------------- | --------- | --------------------------------- |
| Encryption in transit (HTTPS) | 🔧 Ready  | nginx config prepared for SSL/TLS; needs certs (Let's Encrypt or Cloudflare) |
| Encryption at rest            | 🔧 Needed | PostgreSQL on encrypted volume (DigitalOcean/AWS default); verify when deploying |
| Security headers              | ✅ Done   | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS (when HTTPS active) |
| Password hashing              | ✅ Done   | bcrypt via passlib                |
| JWT authentication            | ✅ Done   | python-jose, HS256, 24h expiry   |
| CORS restrictions             | ✅ Done   | Whitelist-based origins           |
| Server version hidden         | ✅ Done   | nginx `server_tokens off`         |
| S3 document storage           | ✅ Done   | LocalStack (dev), DO Spaces/AWS (prod) |
| Database backups              | ⬜ TODO   | Set up automated PG backups       |
| Disaster recovery plan        | ⬜ TODO   | Document RTO/RPO                  |

### 4. 🔧 Access & Training Records

| Requirement                 | Status    | Details                        |
| --------------------------- | --------- | ------------------------------ |
| Production access tracking  | ⬜ TODO   | Document who has DB/server access |
| Access grant/revoke log     | ⬜ TODO   | Track when access is granted/revoked |
| HIPAA training records      | ⬜ TODO   | Track who completed training and when |
| Role-based access control   | ✅ Done   | UserRole enum + require_role() guards |

---

## HTTPS Setup Guide

### Option A: Let's Encrypt (self-managed server)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renew
sudo certbot renew --dry-run
```

Then uncomment the HTTPS server block in `frontend/nginx.conf`.

### Option B: Cloudflare (recommended for simplicity)

1. Point your domain DNS to Cloudflare
2. Enable "Full (strict)" SSL mode
3. Cloudflare handles TLS termination → your nginx stays on port 80
4. Add `proxy_set_header X-Forwarded-Proto https;` to nginx
5. The backend's HSTS middleware activates automatically when it sees `X-Forwarded-Proto: https`

### Option C: DigitalOcean App Platform / Load Balancer

- Built-in SSL with Let's Encrypt
- No nginx config changes needed
- TLS terminates at the load balancer

---

## Immediate Priorities

1. ✅ **Audit logging** — `audit_logs` table, middleware, admin viewer
2. ✅ **Security headers** — backend + nginx
3. 🔧 **HTTPS** — get SSL certs and enable (Cloudflare recommended)
4. 🔧 **Sign BAAs** with every vendor touching PHI:
   - [ ] Cloud hosting (DigitalOcean / AWS)
   - [ ] Email provider (if sending PHI via email)
   - [ ] Analytics (ensure no PHI in analytics)
   - [ ] Error tracking (ensure no PHI in error reports)
5. ⬜ **Write remaining policies** (buy templates to save time)
6. ⬜ **Database backups** — automated daily backups with encryption

---

## Scaling Compliance

| Stage                       | What to do                           | Cost        |
| --------------------------- | ------------------------------------ | ----------- |
| **MVP (now)**               | Document policies, BAAs, audit logs  | $500–1,000  |
| **First health system clients** | SOC 2 Type II certification     | $20K–50K    |
| **Enterprise / large payers** | HITRUST CSF certification          | $50K–150K   |

> **Automation tools:** When scaling, use [Vanta](https://vanta.com) or
> [Drata](https://drata.com) to automate evidence collection and
> dramatically reduce SOC 2 prep time ($15K-25K/year).

---

## Third-Party Certifications

| Certification   | What it is                         | Who asks for it              |
| --------------- | ---------------------------------- | ---------------------------- |
| **SOC 2 Type II** | Security audit over 3-6 months   | SaaS clients, health systems |
| **HITRUST CSF** | Gold standard, HIPAA-specific      | Large payers, enterprise     |
| **ISO 27001**   | International security standard    | International clients        |

Start with SOC 2 Type II when you have paying health system clients.
