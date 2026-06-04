use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::VaultConfig;
use crate::WhitelistEntry;

#[derive(Accounts)]
pub struct AddToWhitelist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [crate::VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        has_one = authority @ ErrorCode::NotAuthority,
    )]
    pub vault_config: Account<'info, VaultConfig>,
    /// CHECK: whitelisted user, not validated here
    pub user: UncheckedAccount<'info>,
}

impl<'info> AddToWhitelist<'info> {
    pub fn add(&mut self, max_deposit: u64, max_withdraw: u64) -> Result<()> {
        let config = &mut self.vault_config;
        let count = config.whitelist_count as usize;

        require!(count < crate::MAX_WHITELIST, ErrorCode::WhitelistFull);

        for i in 0..count {
            require!(
                config.whitelist[i].user != self.user.key(),
                ErrorCode::AlreadyWhitelisted
            );
        }

        config.whitelist[count] = WhitelistEntry {
            user: self.user.key(),
            max_deposit,
            max_withdraw,
        };
        config.whitelist_count = (count + 1) as u32;

        Ok(())
    }
}
