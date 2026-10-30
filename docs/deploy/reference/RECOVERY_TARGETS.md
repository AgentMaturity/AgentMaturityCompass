# Recovery targets (P2-06)

`qualification/reference-deployment/targets.json` holds the recovery point objective (RPO), the recovery time objective (RTO) and the backup cadence for the reference deployment. It ships empty. **Sid agrees the values with the P2-03 partner** and records them there; an agent never fills them in.

`scripts/qualify-reference-deployment.mjs` refuses to run (exit 2) until every field is set. There are no defaults:

| Field | Meaning |
|---|---|
| `rpoSeconds` | Most data, in seconds of writes, that may be lost when the workspace volume is lost. |
| `rtoSeconds` | Longest time, in seconds, from volume loss until Studio serves the restored workspace. |
| `backupCadenceSeconds` | How often `amc backup create` runs; BR-2 deletes the volume one cadence after a backup. |
| `agreedBy`, `agreedOn`, `partner` | Who agreed the values, on which date, with which partner. |
| `status` | `agreed` once Sid and the partner sign off. `engineering-placeholder` is accepted only so a local or CI run can exercise the other checks; BR-2 is then recorded as not run, so the receipt can never pass. |

BR-2 compares the measured RPO and RTO with these values. A local kind run uses a scratch targets file passed with `--targets`, marked `engineering-placeholder`; that file is never committed as the agreed record.
