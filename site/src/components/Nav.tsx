'use client';

import { useState } from 'react';
import Link from 'next/link';

interface NavProps {
  variant: 'full' | 'simple';
  onOpenModal?: () => void;
}

const LogoSvg = () => (
  <svg className="nav-logo-icon" viewBox="0 0 46 45" width="26" height="25" fill="none">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M29.9954 25.9848C27.0634 28.9612 24.1515 31.9573 21.1925 34.9081C18.2217 37.8723 15.2559 40.8476 12.164 43.6889C11.4179 44.3755 10.2037 44.8323 9.16624 44.9103C6.80521 45.088 4.41686 44.9084 2.04405 44.9852C0.528276 45.0342 -0.00550762 44.4123 0.0332414 42.9894C0.0955438 40.8105 -0.123651 38.6112 0.112262 36.4557C0.245224 35.241 0.757345 33.8204 1.60109 32.9653C6.89755 27.5999 12.3357 22.37 17.7214 17.0897C18.2571 16.563 18.7555 15.9982 19.7459 14.9464C17.1273 14.9464 15.1499 14.9449 13.1726 14.9468C9.50132 14.9498 5.82816 14.9052 2.15878 14.9824C0.55183 15.0162 -0.0176323 14.3938 0.0279548 12.8674C0.103933 10.2673 -0.017666 7.66124 0.0788267 5.06262C0.206471 1.55884 1.78302 0.0542932 5.32628 0.0468707C18.0686 0.0212631 30.8106 0.0676624 43.5526 0.000117703C45.4642 -0.00990266 46.0097 0.618421 45.9999 2.44101C45.9341 14.8889 45.9763 27.3372 45.9577 39.7851C45.9509 43.4254 44.4302 44.908 40.7201 44.9563C38.13 44.9897 35.5331 44.8865 32.946 44.9945C31.2468 45.065 30.6792 44.4605 30.7046 42.8108C30.7837 37.7487 30.7331 32.6843 30.7248 27.6203C30.7233 27.2102 30.6556 26.8001 30.6203 26.3901L29.9954 25.9848Z"
      fill="#15EE76"
    />
  </svg>
);

export default function Nav({ variant, onOpenModal }: NavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const isFull = variant === 'full';

  const platformHref = isFull ? '#platform' : '/#platform';
  const dataHref = isFull ? '#data' : '/#data';
  const pricingHref = isFull ? '#pricing' : '/#pricing';

  const closeMobile = () => setMobileOpen(false);

  const desktopLinks = (
    <>
      <a href={platformHref} className="nav-link">Platform</a>
      <a href={dataHref} className="nav-link">Data</a>
      <Link href="/methodology" className="nav-link">Methodology</Link>
      <Link href="/blog" className="nav-link">Insights</Link>
      <a href={pricingHref} className="nav-link">Pricing</a>
      <a
        href="https://www.thedatafusion.com/contact"
        className="nav-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        Support
      </a>
    </>
  );

  const mobileLinks = (
    <>
      <a href={platformHref} className="nav-link" onClick={closeMobile}>Platform</a>
      <a href={dataHref} className="nav-link" onClick={closeMobile}>Data</a>
      <Link href="/methodology" className="nav-link" onClick={closeMobile}>Methodology</Link>
      <Link href="/blog" className="nav-link" onClick={closeMobile}>Insights</Link>
      <a href={pricingHref} className="nav-link" onClick={closeMobile}>Pricing</a>
      <a
        href="https://www.thedatafusion.com/contact"
        className="nav-link"
        target="_blank"
        rel="noopener noreferrer"
        onClick={closeMobile}
      >
        Support
      </a>
    </>
  );

  return (
    <nav className="nav" id="nav">
      <div className="nav-inner">
        <a href={isFull ? '#' : '/'} className="nav-logo" aria-label="Disruptis Home">
          <LogoSvg />
          <span className="nav-logo-text">DISRUPTIS</span>
        </a>

        <div className="nav-links" id="navLinks">
          {desktopLinks}
        </div>

        <div className="nav-actions">
          {isFull ? (
            <button className="btn btn-primary btn-sm" onClick={onOpenModal}>
              Request Access
            </button>
          ) : (
            <a href="/#pricing" className="btn btn-primary btn-sm">
              Request Access
            </a>
          )}
        </div>

        <button
          className="nav-hamburger"
          id="navHamburger"
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      <div className={`nav-mobile${mobileOpen ? ' open' : ''}`} id="navMobile">
        {mobileLinks}
        <div className="nav-mobile-actions">
          {isFull ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                closeMobile();
                onOpenModal?.();
              }}
            >
              Request Access
            </button>
          ) : (
            <a href="/#pricing" className="btn btn-primary" onClick={closeMobile}>
              Request Access
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
