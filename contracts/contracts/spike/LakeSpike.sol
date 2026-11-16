// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract LakeSpike is ZamaEthereumConfig {
    uint8 public constant SIZE = 8;
    uint8 public constant CELLS = 64;
    uint8 public constant SEATS = 6;
    uint8 internal constant LAYER_BITS = 5;
    uint8 internal constant DEPTH_MASK = 3;
    uint8 internal constant BOTTOM = 2;
    uint8 internal constant LIVE_FISH = 2;
    uint8 internal constant LEVIATHAN_WEIGHT = 100;

    uint16[4][3] internal _thresholds;
    euint16[64] internal _cells;
    ebool[64] internal _hot;
    euint8 internal _levPos;
    ebool internal _levCaught;
    euint8[2][6] internal _traps;
    euint32[6] internal _scores;
    bool[6] internal _hasTraps;

    euint8 public lastCatch;
    ebool public lastRareNear;
    ebool public lastLevNear;
    ebool public lastSnagged;
    euint16 public revealHandle;
    uint16 public revealedCell;
    bool public revealed;

    error BadCell();
    error BadRange();
    error AlreadyRevealed();

    constructor() {
        _thresholds[0] = [uint16(6), 11, 14, 16];
        _thresholds[1] = [uint16(5), 9, 13, 15];
        _thresholds[2] = [uint16(4), 7, 11, 14];
        _levCaught = FHE.asEbool(false);
        FHE.allowThis(_levCaught);
        for (uint8 s = 0; s < SEATS; s++) {
            _scores[s] = FHE.asEuint32(0);
            FHE.allowThis(_scores[s]);
        }
    }

    function generate(uint8 from, uint8 count) external {
        if (uint16(from) + count > CELLS) revert BadRange();
        euint16[5][3] memory layerConst;
        for (uint8 d = 0; d < 3; d++) {
            for (uint8 k = 0; k < 5; k++) layerConst[d][k] = FHE.asEuint16(_layerValue(d, k));
        }
        for (uint8 i = from; i < from + count; i++) {
            (euint16 cell, ebool hot) = _genCell(layerConst);
            _cells[i] = cell;
            _hot[i] = hot;
            FHE.allowThis(cell);
            FHE.allowThis(hot);
        }
    }

    function _layerValue(uint8 d, uint8 rarity) internal pure returns (uint16) {
        if (rarity == 0) return 0;
        uint16 stock = rarity >= 3 ? 1 : 2;
        return ((uint16(rarity) << 2) | stock) << (d * LAYER_BITS);
    }

    function placeLeviathan() external {
        _levPos = FHE.randEuint8(CELLS);
        FHE.allowThis(_levPos);
    }

    function setTraps(uint8 seat, externalEuint8 a, externalEuint8 b, bytes calldata proof) external {
        _traps[seat][0] = FHE.fromExternal(a, proof);
        _traps[seat][1] = FHE.fromExternal(b, proof);
        FHE.allowThis(_traps[seat][0]);
        FHE.allowThis(_traps[seat][1]);
        _hasTraps[seat] = true;
    }

    function cast(uint8 seat, uint8 cell, externalEuint8 choice, bytes calldata proof) external {
        _cast(seat, cell, FHE.fromExternal(choice, proof));
    }

    function castTwo(uint8 seat, uint8[2] calldata cells, externalEuint8[2] calldata choices, bytes calldata proof) external {
        _cast(seat, cells[0], FHE.fromExternal(choices[0], proof));
        _cast(seat, cells[1], FHE.fromExternal(choices[1], proof));
    }

    function startReveal(uint8 cell) external {
        revealHandle = _cells[cell];
        FHE.makePubliclyDecryptable(revealHandle);
    }

    function revealAll() external {
        for (uint8 i = 0; i < CELLS; i++) FHE.makePubliclyDecryptable(_cells[i]);
    }

    function finishReveal(bytes calldata cleartexts, bytes calldata proof) external {
        if (revealed) revert AlreadyRevealed();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = euint16.unwrap(revealHandle);
        FHE.checkSignatures(handles, cleartexts, proof);
        revealedCell = abi.decode(cleartexts, (uint16));
        revealed = true;
    }

    function cellHandle(uint8 i) external view returns (euint16) {
        return _cells[i];
    }

    function hotHandle(uint8 i) external view returns (ebool) {
        return _hot[i];
    }

    function scoreHandle(uint8 seat) external view returns (euint32) {
        return _scores[seat];
    }

    function levHandle() external view returns (euint8) {
        return _levPos;
    }

    function _genCell(euint16[5][3] memory layerConst) internal returns (euint16 cell, ebool hot) {
        euint16 r = FHE.randEuint16();
        euint16[3] memory layers;
        ebool[3] memory rare;
        for (uint8 d = 0; d < 3; d++) {
            euint16 u = FHE.and(d == 0 ? r : FHE.shr(r, d * 4), uint16(15));
            ebool g1 = FHE.ge(u, _thresholds[d][0]);
            ebool g2 = FHE.ge(u, _thresholds[d][1]);
            ebool g3 = FHE.ge(u, _thresholds[d][2]);
            ebool g4 = FHE.ge(u, _thresholds[d][3]);
            layers[d] = FHE.select(g4, layerConst[d][4], FHE.select(g3, layerConst[d][3], FHE.select(g2, layerConst[d][2], FHE.select(g1, layerConst[d][1], layerConst[d][0]))));
            rare[d] = g3;
        }
        cell = FHE.add(FHE.add(layers[0], layers[1]), layers[2]);
        hot = FHE.or(FHE.or(rare[0], rare[1]), rare[2]);
    }

    function _layerAt(euint16 cell, uint8 d) internal returns (euint16) {
        return FHE.and(FHE.shr(cell, d * LAYER_BITS), uint16(31));
    }

    function _cast(uint8 seat, uint8 cell, euint8 choice) internal {
        if (cell >= CELLS) revert BadCell();
        euint16 packed = _cells[cell];
        euint8 depth = FHE.and(choice, DEPTH_MASK);
        euint8 bait = FHE.shr(choice, uint8(2));
        ebool d0 = FHE.eq(depth, uint8(0));
        ebool d1 = FHE.eq(depth, uint8(1));

        euint16 layer = FHE.select(d0, _layerAt(packed, 0), FHE.select(d1, _layerAt(packed, 1), _layerAt(packed, 2)));
        euint16 rarity = FHE.shr(layer, uint8(2));
        euint16 stock = FHE.and(layer, uint16(3));

        ebool worm = FHE.and(FHE.ge(rarity, uint16(1)), FHE.le(rarity, uint16(2)));
        ebool spoon = FHE.ge(rarity, uint16(2));
        ebool live = FHE.eq(rarity, uint16(4));
        ebool compatible = FHE.select(FHE.eq(bait, uint8(0)), worm, FHE.select(FHE.eq(bait, uint8(1)), spoon, live));
        ebool caught = FHE.and(FHE.gt(stock, uint16(0)), compatible);

        euint16 step = FHE.select(d0, FHE.asEuint16(1), FHE.select(d1, FHE.asEuint16(32), FHE.asEuint16(1024)));
        packed = FHE.sub(packed, FHE.select(caught, step, FHE.asEuint16(0)));
        _cells[cell] = packed;
        FHE.allowThis(packed);
        _hot[cell] = _hotOf(packed);
        FHE.allowThis(_hot[cell]);

        ebool lev = FHE.and(
            FHE.and(FHE.eq(_levPos, cell), FHE.eq(depth, BOTTOM)),
            FHE.and(FHE.eq(bait, LIVE_FISH), FHE.not(_levCaught))
        );
        _levCaught = FHE.or(_levCaught, lev);
        FHE.allowThis(_levCaught);

        euint8 weight = FHE.select(lev, FHE.asEuint8(LEVIATHAN_WEIGHT), FHE.select(caught, _points(rarity), FHE.asEuint8(0)));
        ebool snagged = _applyTraps(seat, cell, weight);

        lastCatch = FHE.select(snagged, FHE.asEuint8(0), weight);
        lastRareNear = _rareNear(cell);
        lastLevNear = _levNear(cell);
        lastSnagged = snagged;
        _grant(lastCatch);
        _grantBool(lastRareNear);
        _grantBool(lastLevNear);
        _grantBool(lastSnagged);
    }

    function _points(euint16 rarity) internal returns (euint8) {
        euint8 r = FHE.asEuint8(rarity);
        return FHE.select(
            FHE.eq(r, uint8(1)),
            FHE.asEuint8(1),
            FHE.select(FHE.eq(r, uint8(2)), FHE.asEuint8(3), FHE.select(FHE.eq(r, uint8(3)), FHE.asEuint8(8), FHE.asEuint8(25)))
        );
    }

    function _hotOf(euint16 packed) internal returns (ebool hot) {
        hot = FHE.asEbool(false);
        for (uint8 d = 0; d < 3; d++) {
            euint16 layer = _layerAt(packed, d);
            hot = FHE.or(hot, FHE.and(FHE.ge(layer, uint16(12)), FHE.gt(FHE.and(layer, uint16(3)), uint16(0))));
        }
    }

    function _applyTraps(uint8 seat, uint8 cell, euint8 weight) internal returns (ebool taken) {
        taken = FHE.asEbool(false);
        euint32 w = FHE.asEuint32(weight);
        euint32 zero = FHE.asEuint32(0);
        for (uint8 s = 0; s < SEATS; s++) {
            if (s == seat || !_hasTraps[s]) continue;
            ebool hit = FHE.or(FHE.eq(_traps[s][0], cell), FHE.eq(_traps[s][1], cell));
            ebool mine = FHE.and(hit, FHE.not(taken));
            taken = FHE.or(taken, hit);
            _scores[s] = FHE.add(_scores[s], FHE.select(mine, w, zero));
            FHE.allowThis(_scores[s]);
        }
        _scores[seat] = FHE.add(_scores[seat], FHE.select(taken, zero, w));
        FHE.allowThis(_scores[seat]);
    }

    function _rareNear(uint8 cell) internal returns (ebool near) {
        near = FHE.asEbool(false);
        uint8[8] memory ns;
        uint8 n = _neighbours(cell, ns);
        for (uint8 i = 0; i < n; i++) near = FHE.or(near, _hot[ns[i]]);
    }

    function _levNear(uint8 cell) internal returns (ebool) {
        uint8[8] memory ns;
        uint8 n = _neighbours(cell, ns);
        euint8[] memory set = new euint8[](n);
        for (uint8 i = 0; i < n; i++) set[i] = FHE.asEuint8(ns[i]);
        return FHE.isIn(_levPos, set);
    }

    function _neighbours(uint8 cell, uint8[8] memory out) internal pure returns (uint8 n) {
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

    function _grant(euint8 h) internal {
        FHE.allowThis(h);
        FHE.allow(h, msg.sender);
    }

    function _grantBool(ebool h) internal {
        FHE.allowThis(h);
        FHE.allow(h, msg.sender);
    }
}
