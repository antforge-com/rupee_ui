import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/Homepage.module.css";



export default function HomePage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={styles.container}>
      
      {/* Header */}
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            FIN<span>ADVISE</span>
          </div>

          <div className={styles.navButtons}>
            <button onClick={() => navigate("/login")} className={styles.loginBtn}>
              Log In
            </button>

            <button onClick={() => navigate("/register")} className={styles.primaryBtn}>
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className={styles.hero}>
        <div>
          <div className={styles.badge}>
            <span className={styles.dot} />
            SEBI CERTIFIED ADVISORY
          </div>

          <h1 className={styles.heroTitle}>
            Modern Wealth <br />
            Management <span>Simplified.</span>
          </h1>

          <p className={styles.heroText}>
            Connect with India's top financial consultants. Get personalised
            strategies for wealth creation, tax optimisation, and retirement.
          </p>

          <div className={styles.heroButtons}>
            <button onClick={() => navigate("/register")} className={styles.primaryLarge}>
              Start for Free
            </button>

            <button onClick={() => navigate("/login")} className={styles.secondaryBtn}>
              Explore Plans
            </button>
          </div>
        </div>

        <div>
          <img
            src="https://wallpapers.com/images/hd/trading-wallpaper-ynfqhj74ml8p96ca.jpg"
            alt="Trading Finance"
            className={styles.heroImage}
          />
        </div>
      </section>

      {/* Stats */}
      <section className={styles.statsSection}>
        <div className={styles.statsGrid}>
          {[
            { val: "10,000+", lbl: "Active Clients" },
            { val: "₹500 Cr+", lbl: "Assets Managed" },
            { val: "50+", lbl: "Expert Advisors" },
            { val: "99.9%", lbl: "Data Security" }
          ].map((s, i) => (
            <div key={i}>
              <div className={styles.statValue}>{s.val}</div>
              <div className={styles.statLabel}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className={styles.featuresSection}>
        <div className={styles.featuresContainer}>
          <h2 className={styles.featuresTitle}>
            Built for Smarter Decisions
          </h2>

          <div className={styles.featuresGrid}>
            {[
              {
                icon: "🎯",
                title: "Personalised Roadmap",
                desc: "Tailored strategies designed for your unique income goals."
              },
              {
                icon: "⚡",
                title: "Instant Booking",
                desc: "Consult with verified experts in just a few clicks."
              },
              {
                icon: "🛡️",
                title: "Verified Security",
                desc: "SEBI certified experts and 256-bit data encryption."
              }
            ].map((f, i) => (
              <div key={i} className={styles.featureCard}>
                <div className={styles.featureIcon}>{f.icon}</div>
                <div className={styles.featureTitle}>{f.title}</div>
                <div className={styles.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <div className={styles.footerLogo}>
              FIN<span>ADVISE</span>
            </div>
            <p className={styles.footerText}>
              India's trusted platform for SEBI-certified financial guidance.
            </p>
          </div>

          <div className={styles.footerLinks}>
            <div>
              <div className={styles.footerHeading}>Product</div>
              <div className={styles.footerLinkList}>
                <span>Features</span>
                <span>Consultants</span>
              </div>
            </div>

            <div>
              <div className={styles.footerHeading}>Legal</div>
              <div className={styles.footerLinkList}>
                <span>Privacy</span>
                <span>Terms</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          © 2026 FINADVISE. All rights reserved.
        </div>
      </footer>
    </div>
  );
}