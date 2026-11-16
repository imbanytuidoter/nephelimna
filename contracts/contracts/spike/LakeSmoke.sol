// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract LakeSmoke is ZamaEthereumConfig {
    uint8 internal constant LAYER_BITS = 5;
    uint16 internal constant LAYER_MASK = 31;

    euint16 public cell;
    euint8 public layer;

    function seed(uint16 packed) external {
        cell = FHE.asEuint16(packed);
        FHE.allowThis(cell);
    }

    function pick(uint8 depth) external {
        euint16 shifted = FHE.shr(cell, depth * LAYER_BITS);
        layer = FHE.asEuint8(FHE.and(shifted, LAYER_MASK));
        FHE.allowThis(layer);
    }
}
