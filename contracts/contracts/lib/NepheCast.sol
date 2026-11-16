// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {Sea, Angler, CELLS} from "./NepheTypes.sol";
import {NepheLake} from "./NepheLake.sol";
import {NepheScore} from "./NepheScore.sol";
import {NepheTraps} from "./NepheTraps.sol";

library NepheCast {
    uint8 internal constant DEPTH_MASK = 3;
    uint8 internal constant BOTTOM = 2;
    uint8 internal constant LIVE_FISH = 2;

    /// @dev The same sequence of FHE operations runs for an empty cast, a catch, the Leviathan and a
    /// netted catch, and a fresh square is always rolled and then kept or dropped with FHE.select,
    /// so gas and HCU depend only on the public square and the number of live nets.
    function resolve(Sea storage sea, address player, uint8 cell, euint8 choice, address reader) internal {
        euint16 packed = sea.cells[cell];
        euint8 depth = FHE.and(choice, DEPTH_MASK);
        euint8 bait = FHE.shr(choice, uint8(2));
        ebool d0 = FHE.eq(depth, uint8(0));
        ebool d1 = FHE.eq(depth, uint8(1));

        euint16 layer = FHE.select(d0, NepheLake.layerAt(packed, 0), FHE.select(d1, NepheLake.layerAt(packed, 1), NepheLake.layerAt(packed, 2)));
        euint16 rarity = FHE.shr(layer, uint8(2));
        ebool caught = FHE.and(FHE.gt(FHE.and(layer, uint16(3)), uint16(0)), _bites(bait, rarity));
        ebool lev = FHE.and(FHE.and(FHE.eq(sea.levPos, cell), FHE.eq(depth, BOTTOM)), FHE.eq(bait, LIVE_FISH));

        euint8 weight = FHE.select(lev, FHE.asEuint8(NepheScore.LEVIATHAN), FHE.select(caught, NepheScore.points(rarity), FHE.asEuint8(0)));
        ebool small = FHE.and(FHE.and(caught, FHE.not(lev)), FHE.le(rarity, uint16(2)));
        ebool snagged = NepheTraps.settle(sea, player, cell, weight, small);

        _restock(sea, cell, packed, FHE.or(caught, lev));
        sea.levPos = FHE.select(lev, FHE.randEuint8(CELLS), sea.levPos);
        FHE.allowThis(sea.levPos);

        Angler storage angler = sea.anglers[player];
        angler.lastCatch = FHE.select(snagged, FHE.asEuint8(0), weight);
        angler.lastRareNear = NepheLake.rareNear(sea, cell);
        angler.lastLevNear = NepheLake.levNear(sea, cell);
        angler.lastSnagged = snagged;
        _share(angler.lastCatch, reader, player);
        _share(angler.lastRareNear, reader, player);
        _share(angler.lastLevNear, reader, player);
        _share(angler.lastSnagged, reader, player);
    }

    function _restock(Sea storage sea, uint8 cell, euint16 packed, ebool used) private {
        (euint16 fresh, ebool freshHot) = NepheLake.roll();
        sea.cells[cell] = FHE.select(used, fresh, packed);
        sea.hot[cell] = FHE.select(used, freshHot, sea.hot[cell]);
        FHE.allowThis(sea.cells[cell]);
        FHE.allowThis(sea.hot[cell]);
    }

    function _share(euint8 value, address reader, address player) private {
        FHE.allowThis(value);
        FHE.allow(value, reader);
        if (player != reader) FHE.allow(value, player);
    }

    function _share(ebool value, address reader, address player) private {
        FHE.allowThis(value);
        FHE.allow(value, reader);
        if (player != reader) FHE.allow(value, player);
    }

    function _bites(euint8 bait, euint16 rarity) private returns (ebool) {
        ebool worm = FHE.and(FHE.ge(rarity, uint16(1)), FHE.le(rarity, uint16(2)));
        ebool spoon = FHE.ge(rarity, uint16(2));
        ebool live = FHE.eq(rarity, uint16(4));
        return FHE.select(FHE.eq(bait, uint8(0)), worm, FHE.select(FHE.eq(bait, uint8(1)), spoon, live));
    }
}
