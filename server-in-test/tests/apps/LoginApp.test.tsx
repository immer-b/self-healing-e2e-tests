// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginApp } from '../../src/apps/login/LoginApp';
import { mockFetch } from './testUtils';

const usernameField = () => screen.getByRole('textbox', { name: /username/i });
const passwordField = () => screen.getByLabelText(/password/i, { selector: 'input' });
const submitButton = () => screen.getByRole('button', { name: /log in|sign in|continue/i });

function mockLoginApi() {
  return mockFetch({
    'POST /api/login': (init) => {
      const { username, password } = JSON.parse(String(init?.body));
      return username === 'admin' && password === 'password123'
        ? { body: { token: 't', displayName: 'Administrator' } }
        : { status: 401, body: { error: 'Invalid username or password' } };
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe.each([1, 2, 3] as const)('LoginApp v%i', (version) => {
  it('renders a distinct layout per version', () => {
    const { container } = render(<LoginApp version={version} />);
    expect(container.querySelector(`[data-ui-version="${version}"]`)).not.toBeNull();
  });

  it('signs in with valid credentials and shows a welcome message with a link to results', async () => {
    mockLoginApi();
    render(<LoginApp version={version} />);
    await userEvent.type(usernameField(), 'admin');
    await userEvent.type(passwordField(), 'password123');
    await userEvent.click(submitButton());
    expect(await screen.findByText(/Administrator/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /results/i })).toHaveAttribute('href', '/query/');
  });

  it('shows the server error for invalid credentials', async () => {
    mockLoginApi();
    render(<LoginApp version={version} />);
    await userEvent.type(usernameField(), 'admin');
    await userEvent.type(passwordField(), 'wrong');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
  });

  it('validates required fields without calling the server', async () => {
    const fetchMock = mockLoginApi();
    render(<LoginApp version={version} />);
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Username and password are required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
