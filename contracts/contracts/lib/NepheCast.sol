// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {Round} from "./NepheTypes.sol";
import {NepheLake} from "./NepheLake.sol";
import {NepheScore} from "./NepheScore.sol";
import {NepheTraps} from "./NepheTraps.sol";

library NepheCast {
    uint8 internal constant DEPTH_MASK = 3;
    uint8 internal constant BOTTOM = 2;
    uint8 internal constant LIVE_FISH = 2;

    /// @dev The same sequence of FHE operations runs for an empty cast, a catch, the Leviathan and a
    /// netted catch, so gas and HCU depend only on the public cell and seat count.
    function resolve(Round storage round, uint8 seat, uint8 cell, euint8 choice, address reader) internal {
        euint16 packed = round.cells[cell];
        euint8 depth = FHE.and(choice, DEPTH_MASK);
        euint8 bait = FHE.shr(choice, uint8(2));
        ebool d0 = FHE.eq(depth, uint8(0));
        ebool d1 = FHE.eq(depth, uint8(1));

        euint16 layer = FHE.select(d0, NepheLake.layerAt(packed, 0), FHE.select(d1, NepheLake.layerAt(packed, 1), NepheLake.layerAt(packed, 2)));
        euint16 rarity = FHE.shr(layer, uint8(2));
        ebool caught = FHE.and(FHE.gt(FHE.and(layer, uint16(3)), uint16(0)), _bites(bait, rarity));

        euint16 step = FHE.select(d0, FHE.asEuint16(1), FHE.select(d1, FHE.asEuint16(32), FHE.asEuint16(1024)));
        packed = FHE.sub(packed, FHE.select(caught, step, FHE.asEuint16(0)));
        round.cells[cell] = packed;
        FHE.allowThis(packed);
        round.hot[cell] = NepheLake.hotOf(packed);
        FHE.allowThis(round.hot[cell]);

        ebool lev = FHE.and(FHE.and(FHE.eq(round.levPos, cell), FHE.eq(depth, BOTTOM)), FHE.and(FHE.eq(bait, LIVE_FISH), FHE.not(round.levCaught)));
        round.levCaught = FHE.or(round.levCaught, lev);
        FHE.allowThis(round.levCaught);

        euint8 weight = FHE.select(lev, FHE.asEuint8(NepheScore.LEVIATHAN), FHE.select(caught, NepheScore.points(rarity), FHE.asEuint8(0)));
        ebool small = FHE.and(FHE.and(caught, FHE.not(lev)), FHE.le(rarity, uint16(2)));
        ebool snagged = NepheTraps.settle(round, seat, cell, weight, small);

        round.lastCatch[seat] = FHE.select(snagged, FHE.asEuint8(0), weight);
        round.lastRareNear[seat] = NepheLake.rareNear(round, cell);
        round.lastLevNear[seat] = NepheLake.levNear(round, cell);
        round.lastSnagged[seat] = snagged;
        FHE.allowThis(round.lastCatch[seat]);
        FHE.allow(round.lastCatch[seat], reader);
        FHE.allowThis(round.lastRareNear[seat]);
        FHE.allow(round.lastRareNear[seat], reader);
        FHE.allowThis(round.lastLevNear[seat]);
        FHE.allow(round.lastLevNear[seat], reader);
        FHE.allowThis(round.lastSnagged[seat]);
        FHE.allow(round.lastSnagged[seat], reader);
    }

    function _bites(euint8 bait, euint16 rarity) private returns (ebool) {
        ebool worm = FHE.and(FHE.ge(rarity, uint16(1)), FHE.le(rarity, uint16(2)));
        ebool spoon = FHE.ge(rarity, uint16(2));
        ebool live = FHE.eq(rarity, uint16(4));
        return FHE.select(FHE.eq(bait, uint8(0)), worm, FHE.select(FHE.eq(bait, uint8(1)), spoon, live));
    }
}
