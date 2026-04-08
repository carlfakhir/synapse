# GPU Security

GPU security has become a first-class concern as accelerators moved from graphics pipelines to critical AI workloads. Modern data-center GPUs like NVIDIA Hopper and Blackwell support confidential computing modes that extend CPU-style TEE guarantees across PCIe to the GPU's own memory and command queues.

The hard problem is trust across the CPU/GPU boundary: the workload is orchestrated from a CPU enclave but runs on a GPU that must itself be attested, have its firmware verified, and encrypt traffic over PCIe. This is why [[attestation]] protocols now include accelerator measurements alongside platform measurements.

Closely related to [[confidential-computing]] and the broader model of protecting AI training and inference pipelines end-to-end.
