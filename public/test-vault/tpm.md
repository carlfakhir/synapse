# TPM

A Trusted Platform Module is a dedicated cryptoprocessor that provides hardware-backed key storage, sealed storage, and measurement capabilities. TPMs expose primitives for generating keys that never leave the chip, sealing data to a specific platform configuration, and extending Platform Configuration Registers (PCRs) to record the boot chain.

TPMs are a classical root of trust and the anchor for [[confidential-computing]] workflows. The measurements extended into PCRs during boot form the basis of the quote a verifier receives when a workload needs to prove its identity and integrity.

Modern firmware-based TPMs (fTPM) and discrete TPMs share the same TPM 2.0 software stack. The chip itself is tamper-resistant and constrained, not fast — it's the anchor, not the workhorse.
