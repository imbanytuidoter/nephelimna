// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint16, euint32, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {Round, CELLS} from "./NepheTypes.sol";

library NepheReveal {
    function openScores(Round storage round) internal {
        for (uint8 s = 0; s < round.seats; s++) FHE.makePubliclyDecryptable(round.scores[s]);
    }

    /// @dev The handles come from storage, never from the caller, so a proof for any other
    /// ciphertext cannot be replayed as these scores.
    function checkScores(Round storage round, bytes calldata cleartexts, bytes calldata proof) internal returns (uint32[] memory scores) {
        bytes32[] memory handles = new bytes32[](round.seats);
        for (uint8 s = 0; s < round.seats; s++) handles[s] = euint32.unwrap(round.scores[s]);
        FHE.checkSignatures(handles, cleartexts, proof);
        scores = new uint32[](round.seats);
        for (uint8 s = 0; s < round.seats; s++) {
            scores[s] = uint32(uint256(bytes32(cleartexts[uint256(s) * 32:uint256(s) * 32 + 32])));
            round.finalScores[s] = scores[s];
        }
    }

    function openLake(Round storage round, uint8 from, uint8 count) internal {
        for (uint8 i = from; i < from + count; i++) FHE.makePubliclyDecryptable(round.cells[i]);
    }

    function openLeviathan(Round storage round) internal {
        FHE.makePubliclyDecryptable(round.levPos);
    }
}
