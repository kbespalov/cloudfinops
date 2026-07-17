/** Monochrome provider marks — currentColor, matches facet text / theme. */

export function ProviderMark({
  providerId,
  size = 14,
  className,
}: {
  providerId: string;
  size?: number;
  className?: string;
}) {
  switch (providerId) {
    case 'yandex-cloud':
      return <BrandPath path={YANDEX_CLOUD_PATH} size={size} className={className} title="Yandex Cloud" />;
    case 'vk-cloud':
      return <BrandPath path={VK_PATH} size={size} className={className} title="VK Cloud" />;
    case 'selectel':
      return <SelectelMark size={size} className={className} />;
    case 'cloud-ru':
      return <CloudRuMark size={size} className={className} />;
    case 'mws-cloud':
      return <MwsMark size={size} className={className} />;
    case 't1-cloud':
      return <T1Mark size={size} className={className} />;
    default:
      return <LetterMark letters="?" size={size} className={className} />;
  }
}

function BrandPath({
  path,
  size = 14,
  className,
  title,
}: {
  path: string;
  size?: number;
  className?: string;
  title: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>{title}</title>
      <path d={path} />
    </svg>
  );
}

/** Selectel favicon S (no red plate) — from selectel.ru/favicon.svg */
function SelectelMark({size = 14, className}: {size?: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>Selectel</title>
      <path d="M12.3335 17.6331C13.1943 17.6331 13.9442 17.4335 14.5554 17.0338C15.1109 16.663 15.3887 16.1783 15.4445 15.608H17.9999C17.9447 16.4635 17.694 17.205 17.2225 17.8326C16.6664 18.5452 15.9723 19.0872 15.0833 19.458C14.1943 19.8288 13.2219 20 12.1661 20C11.0833 20 10.1109 19.8004 9.22191 19.4013C8.33347 19.0016 7.61122 18.4602 7.05573 17.7187C6.49304 16.9714 6.12921 16.0868 5.99995 15.1516L8.55544 14.7525C8.77798 15.6652 9.22191 16.3489 9.91657 16.8626C10.6112 17.3762 11.4169 17.6331 12.3335 17.6331Z" />
      <path d="M15.9166 11.7007C16.497 11.9934 17.0015 12.4234 17.3887 12.9553C17.7258 13.4312 17.9276 13.9939 17.9718 14.5807H15.2495C15.1943 14.4667 15.1385 14.3811 15.0552 14.2955C14.7774 14.0103 14.3605 13.7541 13.7774 13.5829L9.88839 12.3849C8.94417 12.1281 8.16614 11.7007 7.52726 11.1297C6.88839 10.5594 6.58304 9.67498 6.58304 8.50598C6.58304 7.56487 6.83261 6.73771 7.3053 6.08177C7.77741 5.39749 8.4157 4.88443 9.24952 4.54199C10.0828 4.17122 10.9994 4.02834 11.9994 4C12.9994 4 13.9166 4.19956 14.7216 4.54199C15.5121 4.86017 16.2102 5.38044 16.7498 6.05343C17.2771 6.70937 17.6664 7.53653 17.8884 8.47764L15.2501 8.93402C15.0833 8.16413 14.694 7.53653 14.0828 7.08015C13.4715 6.62376 12.7768 6.39587 11.9718 6.36694C11.4997 6.36694 11.0275 6.42421 10.583 6.59542C10.1385 6.76664 9.77741 6.99454 9.52726 7.30863C9.27712 7.62214 9.13853 7.96458 9.13853 8.3631C9.13853 8.90568 9.3605 9.3048 9.7498 9.56162C10.1661 9.81786 10.6934 10.0463 11.3605 10.2176L14.0275 11.0158C14.7216 11.2154 15.3605 11.4438 15.9166 11.7007Z" />
    </svg>
  );
}

/** Cloud.ru portal mark (no colored plate) — from cloud.ru favicon */
function CloudRuMark({size = 14, className}: {size?: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>Cloud.ru</title>
      <path d="M42 26V34.9014L25.997 42L26 26H42ZM42 22V13.0986L26 6V22H42ZM6 13.0986V34.9014L22 42V6L6 13.0986Z" />
    </svg>
  );
}

/** MWS — rounded frame + MWS letters, monochrome */
function MwsMark({size = 14, className}: {size?: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>MWS Cloud</title>
      <rect
        x="1.25"
        y="1.25"
        width="21.5"
        height="21.5"
        rx="3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <text
        x="5"
        y="12.2"
        fill="currentColor"
        fontSize="7"
        fontWeight="800"
        fontFamily="var(--g-font-family-sans), Arial, sans-serif"
      >
        M
      </text>
      <text
        x="12.2"
        y="12.2"
        fill="currentColor"
        fontSize="7"
        fontWeight="800"
        fontFamily="var(--g-font-family-sans), Arial, sans-serif"
      >
        W
      </text>
      <text
        x="12.2"
        y="19.2"
        fill="currentColor"
        fontSize="7"
        fontWeight="800"
        fontFamily="var(--g-font-family-sans), Arial, sans-serif"
      >
        S
      </text>
    </svg>
  );
}

/** T1 — plus + bar */
function T1Mark({size = 14, className}: {size?: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>T1 Cloud</title>
      <rect x="2" y="9.5" width="12" height="5" rx="0.5" />
      <rect x="5.5" y="3" width="5" height="18" rx="0.5" />
      <rect x="17" y="3" width="5" height="18" rx="0.5" />
    </svg>
  );
}

function LetterMark({
  letters,
  size = 14,
  className,
}: {
  letters: string;
  size?: number;
  className?: string;
}) {
  const fontSize = letters.length > 1 ? 7.5 : 9;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      focusable="false"
      aria-hidden
    >
      <rect width="16" height="16" rx="4" fill="currentColor" opacity="0.14" />
      <text
        x="8"
        y="11.2"
        textAnchor="middle"
        fill="currentColor"
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="var(--g-font-family-sans)"
      >
        {letters}
      </text>
    </svg>
  );
}

/** Simple Icons (CC0) — https://simpleicons.org */
const YANDEX_CLOUD_PATH =
  'M12 0C5.38 0 0 5.38 0 12s5.38 12 12 12 12-5.38 12-12S18.62 0 12 0zM7.163 20.618C4.152 18.927 2.12 15.702 2.12 12c0-5.46 4.42-9.88 9.88-9.88 1.429 0 2.496.536 3.029 1.187.534.65.684 1.715.5 3.253l-3.207.631c-2.905.532-4.506 2.148-5.06 5.065-.07.406-.15.812-.226 1.196-.031.157-.062.312-.09.46-.073.396-.143.773-.208 1.124-.093.505-.177.957-.247 1.34-.324 1.884-.06 3.276.672 4.242zm7.986-11.851c-.087.434-.167.867-.247 1.302-.081.434-.16.868-.247 1.301-.396 2.05-1.364 2.996-3.42 3.391l-2.391.474c.059-.296.119-.611.178-.927.022-.12.044-.241.067-.362.078-.421.157-.855.25-1.313.395-2.05 1.344-2.996 3.399-3.391l2.411-.475zM12 21.88c-1.429 0-2.496-.536-3.029-1.187s-.684-1.715-.5-3.253l3.18-.631c2.905-.532 4.507-2.148 5.08-5.046.069-.406.149-.812.226-1.196.031-.157.062-.311.09-.46.087-.471.171-.917.247-1.327.081-.432.154-.822.215-1.156.325-1.884.061-3.275-.671-4.242C19.848 5.073 21.88 8.298 21.88 12c0 5.46-4.42 9.88-9.88 9.88z';

const VK_PATH =
  'm9.489.004.729-.003h3.564l.73.003.914.01.433.007.418.011.403.014.388.016.374.021.36.025.345.03.333.033c1.74.196 2.933.616 3.833 1.516.9.9 1.32 2.092 1.516 3.833l.034.333.029.346.025.36.02.373.025.588.012.41.013.644.009.915.004.98-.001 3.313-.003.73-.01.914-.007.433-.011.418-.014.403-.016.388-.021.374-.025.36-.03.345-.033.333c-.196 1.74-.616 2.933-1.516 3.833-.9.9-2.092 1.32-3.833 1.516l-.333.034-.346.029-.36.025-.373.02-.588.025-.41.012-.644.013-.915.009-.98.004-3.313-.001-.73-.003-.914-.01-.433-.007-.418-.011-.403-.014-.388-.016-.374-.021-.36-.025-.345-.03-.333-.033c-1.74-.196-2.933-.616-3.833-1.516-.9-.9-1.32-2.092-1.516-3.833l-.034-.333-.029-.346-.025-.36-.02-.373-.025-.588-.012-.41-.013-.644-.009-.915-.004-.98.001-3.313.003-.73.01-.914.007-.433.011-.418.014-.403.016-.388.021-.374.025-.36.03-.345.033-.333c.196-1.74.616-2.933 1.516-3.833.9-.9 2.092-1.32 3.833-1.516l.333-.034.346-.029.36-.025.373-.02.588-.025.41-.012.644-.013.915-.009ZM6.79 7.3H4.05c.13 6.24 3.25 9.99 8.72 9.99h.31v-3.57c2.01.2 3.53 1.67 4.14 3.57h2.84c-.78-2.84-2.83-4.41-4.11-5.01 1.28-.74 3.08-2.54 3.51-4.98h-2.58c-.56 1.98-2.22 3.78-3.8 3.95V7.3H10.5v6.92c-1.6-.4-3.62-2.34-3.71-6.92Z';
