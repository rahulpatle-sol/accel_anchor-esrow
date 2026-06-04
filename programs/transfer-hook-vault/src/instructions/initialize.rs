use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::constants::VAULT_CONFIG_SEED;
use crate::VaultConfig;
use crate::WhitelistEntry;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [VAULT_CONFIG_SEED],
        space = VaultConfig::DISCRIMINATOR.len() + VaultConfig::INIT_SPACE,
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault_config,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn init(&mut self, bumps: &InitializeBumps) -> Result<()> {
        self.vault_config.set_inner(VaultConfig {
            authority: self.authority.key(),
            mint: self.mint.key(),
            vault: self.vault.key(),
            bump: bumps.vault_config,
            whitelist_count: 0,
            whitelist: [WhitelistEntry::default(); crate::MAX_WHITELIST],
        });
        Ok(())
    }
}
