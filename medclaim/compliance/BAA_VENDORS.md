# Business Associate Agreements (BAA) — Vendor Tracker

> **HIPAA Requirement:** You must have a signed BAA with every vendor/subcontractor
> that accesses, stores, transmits, or processes PHI on your behalf.

---

## Vendor List

| Vendor               | Service                    | Touches PHI?  | BAA Status | BAA Date | Notes                                   |
| -------------------- | -------------------------- | ------------- | ---------- | -------- | --------------------------------------- |
| **Cloud Hosting**    | Server/database hosting    | **Yes**       | ⬜ Needed  |          | DigitalOcean / AWS — both offer BAAs    |
| **Object Storage**   | Document storage (S3)      | **Yes**       | ⬜ Needed  |          | Included in hosting BAA usually         |
| **Email Provider**   | Transactional emails       | Maybe         | ⬜ Review  |          | Only if emails contain PHI              |
| **Error Tracking**   | Sentry / Datadog / etc.    | Possibly      | ⬜ Review  |          | Ensure no PHI in error payloads         |
| **Analytics**        | PostHog / GA / etc.        | **No**        | N/A        |          | Never send PHI to analytics             |
| **DNS / CDN**        | Cloudflare                 | No            | N/A        |          | TLS termination only, no PHI stored     |
| **Payment**          | Stripe / etc.              | No            | N/A        |          | Payment data is PCI, not HIPAA          |

---

## How to Get a BAA

### DigitalOcean
- Available on Business plans
- Request via support ticket or account settings
- [DigitalOcean BAA info](https://www.digitalocean.com/trust/hipaa)

### AWS
- Available via AWS Artifact console
- Self-service BAA for eligible services
- [AWS HIPAA info](https://aws.amazon.com/compliance/hipaa-compliance/)

### General Process
1. Contact vendor's compliance team
2. Request their standard BAA
3. Review and sign
4. Store signed copy in `compliance/baa/` folder
5. Update this tracker

---

## Rules

- **Never** use a vendor for PHI processing without a signed BAA
- Review vendor list quarterly
- If a vendor changes their terms, get a new BAA
- Keep signed BAAs for 6+ years (HIPAA retention requirement)
