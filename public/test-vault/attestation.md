# Attestation

Attestation is the process by which a device proves its identity and integrity to a remote party. In a trusted computing context, hardware roots of trust sign measurements of the boot chain and runtime state so a verifier can be confident the system hasn't been tampered with.

Remote attestation is the foundation of [[confidential-computing]]. Without it, an enclave's claims about what it is running are just claims. With it, you can cryptographically bind a workload to a specific hardware identity and measured software state.

Modern attestation protocols rely on [[tpm]] chips or platform security processors that hold keys sealed to the device.
