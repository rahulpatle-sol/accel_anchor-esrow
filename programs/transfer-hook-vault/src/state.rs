use anchor_lang::prelude::*;

use crate::MAX_WHITELIST;

#[derive(Clone, Copy, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct WhitelistEntry {
    pub user: Pubkey,
    pub max_deposit: u64,
    pub max_withdraw: u64,
}

impl Default for WhitelistEntry {
    fn default() -> Self {
        Self {
            user: Pubkey::default(),
            max_deposit: 0,
            max_withdraw: 0,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct VaultConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
    pub whitelist_count: u32,
    pub whitelist: [WhitelistEntry; MAX_WHITELIST],
}
