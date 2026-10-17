# dsse-wrong-payload-type

A correctly signed envelope whose payloadType is application/json, not application/vnd.in-toto+json. The PAE binds the type, and a verifier must refuse a type it does not expect rather than read the payload as an in-toto statement.
