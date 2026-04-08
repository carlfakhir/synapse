# Zero Trust

Zero trust is a security model that assumes no implicit trust based on network location. Every request must be authenticated, authorized, and continuously validated regardless of whether it originates inside or outside a traditional perimeter.

The model pairs naturally with [[attestation]]: if you don't trust the network, you need a strong cryptographic basis for trusting the workload itself. Device posture, identity, and runtime integrity all become prerequisites for access.

Zero trust is often discussed alongside service mesh, mTLS, and SPIFFE/SPIRE identities. It's less a product than an architectural stance — default deny, verify everything, log everything.
