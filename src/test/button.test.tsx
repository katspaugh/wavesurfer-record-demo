// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Button,
  EmptyState,
  IconButton,
  Panel,
  PanelHeader,
  ProgressBar,
  SegmentedControl,
  SelectField,
  StatGrid,
  StatItem,
  StatusPill,
  Toggle,
} from '../components/ui'

afterEach(() => {
  cleanup()
})

describe('Button', () => {
  it('defaults to a non-submit button', () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain('type="button"')
  })

  it('applies variant, size, and caller classes', () => {
    const markup = renderToStaticMarkup(
      <Button className="extra" size="wide" variant="primary">
        Export
      </Button>,
    )

    expect(markup).toContain('extra')
    expect(markup).toContain('primaryButton')
    expect(markup).toContain('wideButton')
  })
})

describe('UI primitives', () => {
  it('requires IconButton labels and renders as an icon-sized button', () => {
    const markup = renderToStaticMarkup(<IconButton aria-label="Delete">x</IconButton>)

    expect(markup).toContain('aria-label="Delete"')
    expect(markup).toContain('iconButton')
  })

  it('renders standard panel header and panel shells', () => {
    const markup = renderToStaticMarkup(
      <Panel>
        <PanelHeader eyebrow="Export" title="MP3 package" meta="No take" />
      </Panel>,
    )

    expect(markup).toContain('toolPanel')
    expect(markup).toContain('Export')
    expect(markup).toContain('MP3 package')
    expect(markup).toContain('No take')
  })

  it('renders empty states, progress, status, stats, and toggles', () => {
    const markup = renderToStaticMarkup(
      <>
        <EmptyState>Nothing here</EmptyState>
        <ProgressBar value={0.42} />
        <StatusPill label="ready" status="idle" />
        <StatGrid ariaLabel="Stats">
          <StatItem label="Duration" value="00:00:01" />
        </StatGrid>
        <Toggle checked label="Echo cancellation" onChange={() => undefined} />
        <SelectField
          label="Bitrate"
          value="32"
          options={[{ label: '32 kbps', value: '32' }]}
          onChange={() => undefined}
        />
        <SegmentedControl
          ariaLabel="Channels"
          value="1"
          options={[
            { label: 'Mono', value: '1' },
            { label: 'Stereo', value: '2' },
          ]}
          onChange={() => undefined}
        />
      </>,
    )

    expect(markup).toContain('Nothing here')
    expect(markup).toContain('width:42%')
    expect(markup).toContain('data-status="idle"')
    expect(markup).toContain('aria-label="Stats"')
    expect(markup).toContain('Echo cancellation')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('32 kbps')
    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('aria-checked="true"')
  })

  it('fires button, toggle, select, and segmented-control callbacks', () => {
    const onButton = vi.fn()
    const onToggle = vi.fn()
    const onSelect = vi.fn()
    const onSegment = vi.fn()

    render(
      <>
        <Button onClick={onButton}>Save</Button>
        <Toggle checked={false} label="Echo cancellation" onChange={onToggle} />
        <SelectField
          label="Bitrate"
          value="32"
          options={[{ label: '32 kbps', value: '32' }, { label: '64 kbps', value: '64' }]}
          onChange={onSelect}
        />
        <SegmentedControl
          ariaLabel="Channels"
          value="1"
          options={[{ label: 'Mono', value: '1' }, { label: 'Stereo', value: '2' }]}
          onChange={onSegment}
        />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByLabelText('Echo cancellation'))
    fireEvent.change(screen.getByLabelText('Bitrate'), { target: { value: '64' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Stereo' }))

    expect(onButton).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('64')
    expect(onSegment).toHaveBeenCalledWith('2')
  })
})
