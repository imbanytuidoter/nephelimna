// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {Sea, SIZE, CELLS, LAYER_BITS} from "./NepheTypes.sol";

library NepheLake {
    function thresholds(uint8 depth) internal pure returns (uint16[4] memory) {
        if (depth == 0) return [uint16(6), 11, 14, 16];
        if (depth == 1) return [uint16(5), 9, 13, 15];
        return [uint16(4), 7, 11, 14];
    }

    function layerValue(uint8 depth, uint8 rarity) internal pure returns (uint16) {
        if (rarity == 0) return 0;
        uint16 stock = rarity >= 3 ? 1 : 2;
        return ((uint16(rarity) << 2) | stock) << (depth * LAYER_BITS);
    }

    function generate(Sea storage sea, uint8 count) internal {
        euint16[5][3] memory layerConst = _layerConst();
        uint8 from = sea.generated;
        for (uint8 i = from; i < from + count; i++) {
            (euint16 cell, ebool hot) = _cell(layerConst);
            sea.cells[i] = cell;
            sea.hot[i] = hot;
            FHE.allowThis(cell);
            FHE.allowThis(hot);
        }
        sea.generated = from + count;
    }

    function roll() internal returns (euint16 cell, ebool hot) {
        return _cell(_layerConst());
    }

    function placeLeviathan(Sea storage sea) internal {
        sea.levPos = FHE.randEuint8(CELLS);
        FHE.allowThis(sea.levPos);
    }

    function layerAt(euint16 cell, uint8 depth) internal returns (euint16) {
        return FHE.and(FHE.shr(cell, depth * LAYER_BITS), uint16(31));
    }

    function neighbours(uint8 cell, uint8[8] memory out) internal pure returns (uint8 n) {
        int8 x = int8(cell % SIZE);
        int8 y = int8(cell / SIZE);
        for (int8 dy = -1; dy <= 1; dy++) {
            for (int8 dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) continue;
                int8 nx = x + dx;
                int8 ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= int8(SIZE) || ny >= int8(SIZE)) continue;
                out[n++] = uint8(ny) * SIZE + uint8(nx);
            }
        }
    }

    function rareNear(Sea storage sea, uint8 cell) internal returns (ebool near) {
        near = FHE.asEbool(false);
        uint8[8] memory ns;
        uint8 n = neighbours(cell, ns);
        for (uint8 i = 0; i < n; i++) near = FHE.or(near, sea.hot[ns[i]]);
    }

    function levNear(Sea storage sea, uint8 cell) internal returns (ebool) {
        uint8[8] memory ns;
        uint8 n = neighbours(cell, ns);
        euint8[] memory set = new euint8[](n);
        for (uint8 i = 0; i < n; i++) set[i] = FHE.asEuint8(ns[i]);
        return FHE.isIn(sea.levPos, set);
    }

    function _layerConst() private returns (euint16[5][3] memory layerConst) {
        for (uint8 d = 0; d < 3; d++) {
            for (uint8 k = 0; k < 5; k++) layerConst[d][k] = FHE.asEuint16(layerValue(d, k));
        }
    }

    function _cell(euint16[5][3] memory layerConst) private returns (euint16 cell, ebool hot) {
        euint16 r = FHE.randEuint16();
        euint16[3] memory layers;
        ebool[3] memory rare;
        for (uint8 d = 0; d < 3; d++) {
            uint16[4] memory t = thresholds(d);
            euint16 u = FHE.and(d == 0 ? r : FHE.shr(r, d * 4), uint16(15));
            ebool g1 = FHE.ge(u, t[0]);
            ebool g2 = FHE.ge(u, t[1]);
            ebool g3 = FHE.ge(u, t[2]);
            ebool g4 = FHE.ge(u, t[3]);
            layers[d] = FHE.select(g4, layerConst[d][4], FHE.select(g3, layerConst[d][3], FHE.select(g2, layerConst[d][2], FHE.select(g1, layerConst[d][1], layerConst[d][0]))));
            rare[d] = g3;
        }
        cell = FHE.add(FHE.add(layers[0], layers[1]), layers[2]);
        hot = FHE.or(FHE.or(rare[0], rare[1]), rare[2]);
    }
}
