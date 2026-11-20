// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { signInAs } from './harness';

const workload = (name: string) => within(screen.getByRole('region', { name: /workload/i })).getByRole('group', { name });
const rounds = () => screen.getByRole('region', { name: /rounds/i });
const onShift = (name: string) => within(screen.getByRole('region', { name: /on shift/i })).getByRole('checkbox', { name });

describe('front desk: care schedule', () => {
  it('shows today’s rounds with room, pet and who is assigned', async () => {
    await signInAs('receiving', '/schedule');
    expect(await screen.findByRole('heading', { level: 1, name: /care schedule/i })).toBeInTheDocument();
    await waitFor(() => expect(within(rounds()).getAllByRole('row')).toHaveLength(9)); // header + 8
    const biscuitMorning = within(rounds()).getByRole('row', { name: /Morning.*Biscuit/ });
    expect(biscuitMorning).toHaveTextContent('E-101');
    expect(within(biscuitMorning).getByRole('combobox', { name: /assign morning round for biscuit/i })).toHaveDisplayValue(/Jordan Lee|Sam Rivera|Alex Chen/);
  });

  it('shows an even workload across general staff', async () => {
    await signInAs('receiving', '/schedule');
    await waitFor(() => expect(workload('Jordan Lee')).toHaveTextContent(/3 rounds/));
    expect(workload('Sam Rivera')).toHaveTextContent(/3 rounds/);
    expect(workload('Alex Chen')).toHaveTextContent(/2 rounds/);
  });

  it('reassigns a single round', async () => {
    const { user, hotel } = await signInAs('receiving', '/schedule');
    const select = await screen.findByRole('combobox', { name: /assign morning round for biscuit/i });
    const target = (select as HTMLSelectElement).value === 'emp-5' ? 'emp-3' : 'emp-5';
    await user.selectOptions(select, target);
    await waitFor(() => expect(hotel.tasks.list({ date: '2026-11-20' }).find((t) => t.petId === 'pet-1' && t.slot === 'morning')?.assigneeId).toBe(target));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/reassigned/i));
  });

  it('generates a day’s rounds for the staff on shift', async () => {
    const { user, hotel } = await signInAs('receiving', '/schedule');
    await screen.findByRole('region', { name: /rounds/i });
    await user.click(screen.getByRole('button', { name: /next day/i }));
    expect(await within(rounds()).findByText(/no care rounds scheduled/i)).toBeInTheDocument();
    await user.click(onShift('Alex Chen'));
    await user.click(screen.getByRole('button', { name: /generate rounds/i }));
    expect(await screen.findByText(/9 rounds created/i)).toBeInTheDocument();
    await waitFor(() => expect(workload('Jordan Lee')).toHaveTextContent(/5 rounds/));
    expect(workload('Sam Rivera')).toHaveTextContent(/4 rounds/);
    expect(workload('Alex Chen')).toHaveTextContent(/0 rounds/);
    expect(hotel.tasks.list({ date: '2026-11-21' })).toHaveLength(9);
  });

  it('rebalances pending rounds across everyone on shift', async () => {
    const { user } = await signInAs('receiving', '/schedule');
    await screen.findByRole('region', { name: /rounds/i });
    await user.click(screen.getByRole('button', { name: /next day/i }));
    await within(rounds()).findByText(/no care rounds scheduled/i);
    await user.click(onShift('Alex Chen'));
    await user.click(screen.getByRole('button', { name: /generate rounds/i }));
    await waitFor(() => expect(workload('Alex Chen')).toHaveTextContent(/0 rounds/));
    await user.click(onShift('Alex Chen'));
    await user.click(screen.getByRole('button', { name: /rebalance/i }));
    await waitFor(() => expect(workload('Alex Chen')).toHaveTextContent(/3 rounds/));
    expect(workload('Jordan Lee')).toHaveTextContent(/3 rounds/);
    expect(workload('Sam Rivera')).toHaveTextContent(/3 rounds/);
  });

  it('locks completed rounds', async () => {
    const { hotel, user } = await signInAs('receiving', '/schedule');
    const [task] = hotel.tasks.list({ date: '2026-11-20', assigneeId: 'emp-3' });
    const jordan = { id: 'emp-3', name: 'Jordan Lee' };
    hotel.tasks.update(task.id, { cleaned: true, fed: true }, jordan);
    hotel.tasks.attachPhoto(task.id, 'pho-x', jordan);
    hotel.tasks.complete(task.id, jordan);
    await user.click(await screen.findByRole('button', { name: /refresh/i }));
    const petName = hotel.pets.get(task.petId)!.name;
    const row = await within(rounds()).findByRole('row', { name: new RegExp(`${task.slot}.*${petName}.*Done`, 'i') });
    expect(within(row).getByRole('combobox')).toBeDisabled();
    await waitFor(() => expect(workload('Jordan Lee')).toHaveTextContent(/1 of 3 done/));
  });
});
