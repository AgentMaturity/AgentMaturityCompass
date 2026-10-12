# root-threshold-downgrade

The verifier pins two roots and requires both (--root-threshold 2), but the only trust list is signed by one root and declares no threshold of its own. A list cannot lower the m-of-n its verifier pinned, so it admits nobody.
