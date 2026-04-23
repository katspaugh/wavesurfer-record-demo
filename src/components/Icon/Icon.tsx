import styles from './Icon.module.css'

export type IconName = 'record' | 'play' | 'pause' | 'resume' | 'stop' | 'download' | 'text' | 'clear'

const iconPaths: Record<IconName, string> = {
  record: 'M12 7.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Z',
  play: 'M8 5.75v12.5L18.2 12 8 5.75Z',
  pause: 'M8 6.5h3v11H8v-11Zm5 0h3v11h-3v-11Z',
  resume: 'M8 5.75v12.5L18.2 12 8 5.75Z',
  stop: 'M7.5 7.5h9v9h-9v-9Z',
  download: 'M11 5h2v7.2l2.7-2.7 1.4 1.4-5.1 5.1-5.1-5.1 1.4-1.4 2.7 2.7V5Zm-4.5 12h11v2h-11v-2Z',
  text: 'M5.5 6.5h13v2h-13v-2Zm0 4.25h13v2h-13v-2Zm0 4.25h8.5v2H5.5v-2Z',
  clear: 'M8 7V5.5h8V7h4v2H4V7h4Zm1 4h2v6H9v-6Zm4 0h2v6h-2v-6Zm-6 0h10l-.7 8H7.7L7 11Z',
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" className={styles.icon} viewBox="0 0 24 24" focusable="false">
      <path d={iconPaths[name]} />
    </svg>
  )
}
