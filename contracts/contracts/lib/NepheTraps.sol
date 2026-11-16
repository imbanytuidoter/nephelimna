// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {Sea, Angler, Net, NET_SLOTS, NET_LIFETIME, NO_SLOT} from "./NepheTypes.sol";

library NepheTraps {
    uint32 internal constant NET_FISH = 3;

    function scan(Sea storage sea, address player) internal view returns (uint8 free, uint8 owned) {
        free = NO_SLOT;
        for (uint8 i = 0; i < NET_SLOTS; i++) {
            Net storage net = sea.nets[i];
            bool live = net.until > block.timestamp;
            if (live && net.owner == player) owned++;
            if (!live && free == NO_SLOT) free = i;
        }
    }

    function set(Sea storage sea, uint8 slot, address player, euint8 cell) internal returns (uint64 until) {
        until = uint64(block.timestamp) + NET_LIFETIME;
        sea.nets[slot] = Net({owner: player, until: until, cell: cell});
        FHE.allowThis(cell);
    }

    /// @dev Nets sit in global slots, so writing one never shows its square. A net lifts the whole
    /// school: the owner scores NET_FISH times a small catch. Every live net of another player has
    /// its owner's total rewritten on every cast, hit or not, so the handle and gas pattern never
    /// shows whose net fired.
    function settle(Sea storage sea, address player, uint8 cell, euint8 weight, ebool small) internal returns (ebool taken) {
        taken = FHE.asEbool(false);
        euint32 w = FHE.asEuint32(weight);
        euint32 zero = FHE.asEuint32(0);
        euint32 haul = FHE.mul(w, NET_FISH);
        for (uint8 i = 0; i < NET_SLOTS; i++) {
            Net storage net = sea.nets[i];
            if (net.until <= block.timestamp || net.owner == player) continue;
            ebool hit = FHE.and(FHE.and(small, FHE.eq(net.cell, cell)), FHE.not(taken));
            taken = FHE.or(taken, hit);
            Angler storage owner = sea.anglers[net.owner];
            owner.score = FHE.add(owner.score, FHE.select(hit, haul, zero));
            shareScore(owner, net.owner);
        }
        Angler storage angler = sea.anglers[player];
        angler.score = FHE.add(angler.score, FHE.select(taken, zero, w));
        shareScore(angler, player);
    }

    function shareScore(Angler storage angler, address player) internal {
        FHE.allowThis(angler.score);
        FHE.allow(angler.score, player);
        if (angler.session != player) FHE.allow(angler.score, angler.session);
    }
}
