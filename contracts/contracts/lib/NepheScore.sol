// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";

library NepheScore {
    uint8 internal constant LEVIATHAN = 100;

    function points(euint16 rarity) internal returns (euint8) {
        euint8 r = FHE.asEuint8(rarity);
        return FHE.select(
            FHE.eq(r, uint8(1)),
            FHE.asEuint8(1),
            FHE.select(FHE.eq(r, uint8(2)), FHE.asEuint8(3), FHE.select(FHE.eq(r, uint8(3)), FHE.asEuint8(8), FHE.asEuint8(25)))
        );
    }
}
