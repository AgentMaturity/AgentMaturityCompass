# SCIM 2.0 Provisioning

AMC exposes host-level SCIM endpoints for enterprise user/group provisioning.

Base path (from signed identity config):

- `/host/scim/v2`

## Create SCIM Token

```bash
amc scim token create \
  --host-dir /path/to/amc-host \
  --name okta-scim \
  --out /secure/path/amc-scim-token.txt
```

AMC prints the token once. Store it in your IdP securely.

AMC stores only token references/hashes in host vault; never plaintext in config files.

## Supported SCIM Endpoints

- `GET /host/scim/v2/ServiceProviderConfig`
- `GET /host/scim/v2/ResourceTypes`
- `GET /host/scim/v2/Schemas`
- `GET|POST /host/scim/v2/Users`
- `GET|PATCH|PUT|DELETE /host/scim/v2/Users/:id`
- `GET|POST /host/scim/v2/Groups`
- `GET|PATCH|PUT|DELETE /host/scim/v2/Groups/:id`

## Group-to-Role Mapping Strategy

SCIM groups do not grant privileges automatically. Grants are derived through signed mapping rules in `identity.yaml`:

```yaml
identity:
  roleMapping:
    rules:
      - match:
          groupsAny: ["amc-ws-default-owner"]
        grant:
          workspaceId: "default"
          roles: ["OWNER","AUDITOR"]
```

This makes role assignment deterministic and auditable.

## Membership Provenance and Safe Revocation

AMC tracks role source provenance (`SCIM_GROUP`, `SSO_GROUP`, `MANUAL`).

When a user is removed from a SCIM group, AMC revokes only roles sourced from that group, preserving manual grants.

## Security Notes

- SCIM uses bearer token auth only.
- Lease-auth agent traffic is blocked from `/host/scim/*`.
- SCIM writes are audited (`SCIM_USER_*`, `SCIM_GROUP_*`, `SCIM_MEMBERSHIP_CHANGED`).
- Rate limits apply and can return `429`.


## PATCH validation

User PATCH accepts `active` as a JSON boolean or a case-insensitive `"true"` or `"false"` string. Other values return HTTP 400 with detail `invalidValue`. Disabling a user also causes their existing identity session to be refused. Supported user paths are `active` and `displayName`; a pathless object may contain those attributes. These User attributes are accepted and ignored, so a request that also carries them still applies its `active` or `displayName` change: `externalId`, `emails` (including filtered paths such as `emails[type eq "work"].value`), `name` and its sub-attributes, `title`, `preferredLanguage`, `phoneNumbers`, `addresses`, and the enterprise extension (`urn:ietf:params:scim:schemas:extension:enterprise:2.0:User` and its attributes). Any other path or attribute returns HTTP 400 with detail `invalidPath`, and the whole request is refused.

Group PATCH supports `members` and filtered removal with `members[value eq "ID"]`. Filtered removal preserves the exact member ID and revokes only that group's role sources. It requires `op: "remove"` without a value. Unsupported group paths return `invalidPath`; malformed member values or unknown users in add/replace return `invalidValue`.

PATCH operations are validated before resource updates. Malformed operation lists return `invalidValue`, and non-string paths return `invalidPath`. An omitted path or an explicit empty path retains the supported pathless forms. These checks do not guarantee rollback after a storage or audit failure.

User listing supports `userName eq "VALUE"` and `externalId eq "VALUE"`. An unsupported nonempty filter returns HTTP 400 with detail `invalidFilter`; a supported filter with no match returns a normal empty list. Error responses use the SCIM Error schema, string `status` and fixed `detail`.

PATCH validation does not change user POST/PUT boolean handling, HTTPS/proxy trust or bearer digest comparison. No Okta or Entra SCIM interoperability result is recorded.
