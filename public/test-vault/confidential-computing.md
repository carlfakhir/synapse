# Confidential Computing

Confidential computing protects data in use by performing computation inside hardware-based trusted execution environments (TEEs). Unlike encryption at rest or in transit, confidential computing targets the moment when data is unavoidably plaintext: while the CPU is operating on it.

Intel SGX, AMD SEV-SNP, and ARM CCA are the major technologies. Each provides memory encryption and integrity guarantees so that even a privileged adversary on the host — including the hypervisor — cannot observe or tamper with enclave state.

The whole model depends on a hardware root of trust like a [[tpm]] to prove the enclave is authentic before secrets are released to it, and it composes naturally with a [[zero-trust]] network posture.
