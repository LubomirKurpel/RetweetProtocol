// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDC is ERC20 {
    constructor() ERC20("USDC", "USDC") {}
	
	function mintTokens(uint _numberOfTokens) external {
		_mint(msg.sender, _numberOfTokens * (10 ** 6));
    }
	
	function decimals() public view virtual override returns (uint8) {
	  return 6;
	}
	
}