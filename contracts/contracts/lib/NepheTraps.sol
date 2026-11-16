// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {Round} from "./NepheTypes.sol";

library NepheTraps {
    uint32 internal constant NET_FISH = 3;

    function set(Round storage round, uint8 seat, euint8 a, euint8 b) internal {
        round.nets[seat][0] = a;
        round.nets[seat][1] = b;
        FHE.allowThis(a);
        FHE.allowThis(b);
        round.netsTide[seat] = round.tide;
    }

    /// @dev A net lifts the whole school, so the owner scores NET_FISH times the fish that was caught.
    /// Every opponent's score is rewritten on every cast, hit or not, so the handle and gas
    /// pattern never shows whose net fired. Which seats have set nets this tide is public.
    function settle(Round storage round, uint8 seat, uint8 cell, euint8 weight, ebool small) internal returns (ebool taken) {
        taken = FHE.asEbool(false);
        euint32 w = FHE.asEuint32(weight);
        euint32 zero = FHE.asEuint32(0);
        euint32 haul = FHE.mul(w, NET_FISH);
        for (uint8 s = 0; s < round.seats; s++) {
            if (s == seat || round.netsTide[s] != round.tide) continue;
            ebool hit = FHE.and(small, FHE.or(FHE.eq(round.nets[s][0], cell), FHE.eq(round.nets[s][1], cell)));
            ebool mine = FHE.and(hit, FHE.not(taken));
            taken = FHE.or(taken, hit);
            round.scores[s] = FHE.add(round.scores[s], FHE.select(mine, haul, zero));
            FHE.allowThis(round.scores[s]);
        }
        round.scores[seat] = FHE.add(round.scores[seat], FHE.select(taken, zero, w));
        FHE.allowThis(round.scores[seat]);
    }
}
