# Risk Assessment — MedClaim

> **Date:** March 4, 2026
> **Assessor:** Daniel Reimer
> **Next review:** June 4, 2026 (quarterly)

HIPAA requires a documented risk assessment (45 CFR §164.308(a)(1)(ii)(A)).
This document identifies risks to the confidentiality, integrity, and
availability of ePHI (electronic Protected Health Information).

---

## PHI Inventory — What data do we store?

| Data Type                  | Where Stored       | Contains PHI? | Sensitivity |
| -------------------------- | ------------------ | ------------- | ----------- |
| Medical bills (uploaded)   | S3 / LocalStack    | **Yes**       | High        |
| Extracted CPT/ICD codes    | PostgreSQL         | **Yes**       | High        |
| Case notes                 | PostgreSQL         | **Yes**       | High        |
| Insurance plan details     | PostgreSQL         | Yes (member IDs, group #s) | Medium |
| User accounts (email, name)| PostgreSQL         | Minimal       | Low-Medium  |
| Dispute letters (generated)| PostgreSQL         | **Yes**       | High        |
| Audit logs                 | PostgreSQL         | No (references only) | Low  |

---

## Risk Matrix

| # | Risk                                    | Likelihood | Impact | Severity | Mitigation                          | Status     |
|---|----------------------------------------|-----------|--------|----------|-------------------------------------|------------|
| 1 | **Unencrypted data in transit**        | Medium    | High   | **HIGH** | Enable HTTPS via Let's Encrypt/Cloudflare | 🔧 In progress |
| 2 | **Unencrypted data at rest**           | Low       | High   | **MEDIUM** | Use encrypted volumes (DO/AWS default) | 🔧 Verify on deploy |
| 3 | **Unauthorized access to PHI**         | Low       | High   | **MEDIUM** | JWT auth, role-based access, audit logging | ✅ Implemented |
| 4 | **No audit trail**                     | High      | High   | **CRITICAL** | audit_logs table + middleware | ✅ Implemented |
| 5 | **Weak/default credentials**           | Medium    | High   | **HIGH** | bcrypt hashing, configurable admin password | ✅ Implemented |
| 6 | **SQL injection**                      | Low       | High   | **MEDIUM** | SQLAlchemy ORM (parameterized queries) | ✅ Implemented |
| 7 | **XSS / CSRF attacks**                | Low       | Medium | **LOW**  | Security headers, React's built-in escaping | ✅ Implemented |
| 8 | **Document storage breach**            | Low       | High   | **MEDIUM** | S3 bucket policies, server-side encryption | 🔧 Verify |
| 9 | **No backup / data loss**              | Medium    | High   | **HIGH** | Automated PG backups needed | ⬜ TODO |
| 10| **Vendor without BAA**                 | Medium    | Medium | **MEDIUM** | Sign BAAs with all vendors | 🔧 In progress |
| 11| **Session hijacking**                  | Low       | High   | **MEDIUM** | Short-lived JWTs (24h), HTTPS-only cookies | 🔧 Need HTTPS |
| 12| **PHI in logs / error reports**        | Medium    | Medium | **MEDIUM** | Ensure logging doesn't capture raw PHI | 🔧 Review |
| 13| **Insider threat (unauthorized staff)**| Low       | High   | **MEDIUM** | Role-based access, audit logging | ✅ Implemented |
| 14| **No incident response plan**          | Medium    | Medium | **MEDIUM** | Write incident response playbook | ⬜ TODO |

---

## Action Items (Priority Order)

1. **[HIGH]** Enable HTTPS — Cloudflare or Let's Encrypt
2. **[HIGH]** Set up automated PostgreSQL backups (daily, encrypted, off-site)
3. **[MEDIUM]** Sign BAAs with hosting provider and any service touching PHI
4. **[MEDIUM]** Verify S3 bucket encryption and access policies
5. **[MEDIUM]** Review application logs to ensure no raw PHI is captured
6. **[LOW]** Write incident response plan
7. **[LOW]** Document production access list and training records

---

## Review Schedule

- **Quarterly:** Review this risk assessment, update status
- **After any breach/incident:** Immediate reassessment
- **After major architecture changes:** Reassessment within 30 days
- **Annually:** Full reassessment with updated threat landscape
