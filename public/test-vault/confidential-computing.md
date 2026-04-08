# Confidential Computing

Confidential computing protects data in use by performing computation inside hardware-based trusted execution environments (TEEs). Unlike encryption at rest or in transit, confidential computing targets the moment when data is unavoidably plaintext: while the CPU is operating on it.

Intel SGX, AMD SEV-SNP, ARM CCA, and NVIDIA Confidential Computing are the major technologies. Each provides memory encryption and integrity guarantees so that even a privileged adversary on the host — including the hypervisor — cannot observe or tamper with enclave state.

The whole model depends on [[attestation]] to prove the enclave is authentic before secrets are released to it. Also relates to [[gpu-security]] for accelerated workloads.
