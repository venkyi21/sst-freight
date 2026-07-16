// @vitest-environment jsdom
//
// Machinery-verification test (ADR-0028): proves the RTL/jsdom setup works end-to-end — jsdom
// opt-in via this docblock (global Vitest environment stays 'node'), RTL render, a real
// userEvent interaction, and jest-dom matchers — so the first client-bug regression test
// (docs/ui-fix-playbook.md) starts from known-working machinery, not a setup debugging session.
// InfoTooltip is used because it has real user-visible behavior with zero API/auth dependencies.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InfoTooltip from './InfoTooltip'

describe('InfoTooltip', () => {
  it('hides the tooltip text until hover, shows it on hover, hides it again on unhover', async () => {
    const user = userEvent.setup()
    render(<InfoTooltip text="Chargeable weight is the greater of gross and volumetric." />)

    const trigger = screen.getByText('i')
    expect(
      screen.queryByText('Chargeable weight is the greater of gross and volumetric.'),
    ).not.toBeInTheDocument()

    await user.hover(trigger)
    expect(
      screen.getByText('Chargeable weight is the greater of gross and volumetric.'),
    ).toBeVisible()

    await user.unhover(trigger)
    expect(
      screen.queryByText('Chargeable weight is the greater of gross and volumetric.'),
    ).not.toBeInTheDocument()
  })
})
