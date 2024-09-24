// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract RetweetToken is ERC20 {
    constructor() ERC20("RetweetToken", "RT") {}
	
	function mintTokens(uint _numberOfTokens) external {
		_mint(msg.sender, _numberOfTokens * (10 ** 18));
    }
	
}