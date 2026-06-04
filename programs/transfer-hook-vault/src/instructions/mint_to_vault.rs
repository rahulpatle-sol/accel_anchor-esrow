use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{self, Mint, MintTo, TokenAccount},
};

use crate::error::ErrorCode;
use crate::VaultConfig;

#[derive(Accounts)]
pub struct MintToVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [crate::VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        has_one = authority @ ErrorCode::NotAuthority,
        has_one = mint,
        has_one = vault,
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(
        mut,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = vault_config,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

impl<'info> MintToVault<'info> {
    pub fn mint(&mut self, amount: u64) -> Result<()> {
        let seeds = &[crate::VAULT_CONFIG_SEED, &[self.vault_config.bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: self.mint.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.vault_config.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.key(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::mint_to(cpi_ctx, amount)
    }
}
