use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::VaultConfig;

#[derive(Accounts)]
pub struct RemoveFromWhitelist<'info> {
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

impl<'info> RemoveFromWhitelist<'info> {
    pub fn remove(&mut self) -> Result<()> {
        let config = &mut self.vault_config;
        let count = config.whitelist_count as usize;

        let mut found = false;
        for i in 0..count {
            if config.whitelist[i].user == self.user.key() {
                found = true;
                for j in i..count - 1 {
                    config.whitelist[j] = config.whitelist[j + 1];
                }
                break;
            }
        }

        require!(found, ErrorCode::NotWhitelisted);

        config.whitelist[count - 1] = Default::default();
        config.whitelist_count = (count - 1) as u32;

        Ok(())
    }
}
