pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use instructions::*;
pub use state::*;

use anchor_lang::prelude::*;

declare_id!("48Gqfxtxn3nXFpj3icq6zRCbuTs3xG6Ah1rD3U7kHNEY");

#[program]
pub mod transfer_hook_vault {
    use super::*;

    #[instruction(discriminator = 0)]
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.init(&ctx.bumps)
    }

    #[instruction(discriminator = 1)]
    pub fn add_to_whitelist(
        ctx: Context<AddToWhitelist>,
        max_deposit: u64,
        max_withdraw: u64,
    ) -> Result<()> {
        ctx.accounts.add(max_deposit, max_withdraw)
    }

    #[instruction(discriminator = 2)]
    pub fn remove_from_whitelist(ctx: Context<RemoveFromWhitelist>) -> Result<()> {
        ctx.accounts.remove()
    }

    #[instruction(discriminator = 3)]
    pub fn mint_to_vault(ctx: Context<MintToVault>, amount: u64) -> Result<()> {
        ctx.accounts.mint(amount)
    }

    #[instruction(discriminator = 4)]
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        ctx.accounts.deposit(amount)
    }

    #[instruction(discriminator = 5)]
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        ctx.accounts.withdraw(amount)
    }
}

#[cfg(feature = "no-entrypoint")]
mod solana_entrypoint {
    use super::instructions::transfer_hook::{
        process_transfer_hook_execute, TRANSFER_HOOK_EXECUTE_DISCRIMINATOR,
    };
    use anchor_lang::solana_program::entrypoint;

    entrypoint!(process_instruction);

    fn process_instruction<'info>(
        program_id: &'info Pubkey,
        accounts: &'info [AccountInfo<'info>],
        instruction_data: &[u8],
    ) -> entrypoint::ProgramResult {
        if instruction_data.len() >= 8
            && instruction_data[..8] == TRANSFER_HOOK_EXECUTE_DISCRIMINATOR
        {
            return process_transfer_hook_execute(program_id, accounts, instruction_data)
                .map_err(Into::into);
        }

        transfer_hook_vault::__private::__global::__instruction_handler(
            program_id,
            accounts,
            instruction_data,
        )
        .map_err(Into::into)
    }
}
