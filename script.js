// CloserMetrix Landing Page - JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all features
    initNavbarScroll();
    initSmoothScroll();
    initScrollReveal();
    initFormSubmit();
    initParallaxStars();
    initCounterAnimation();
});

// Navbar scroll effect
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });
}

// Smooth scrolling for anchor links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));

            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Scroll reveal animations
function initScrollReveal() {
    const revealElements = document.querySelectorAll(
        '.feature-card, .step, .testimonial-card, .pricing-card, .problem-list li'
    );

    revealElements.forEach(el => {
        el.classList.add('reveal');
    });

    const revealOnScroll = () => {
        revealElements.forEach(el => {
            const elementTop = el.getBoundingClientRect().top;
            const windowHeight = window.innerHeight;

            if (elementTop < windowHeight - 100) {
                el.classList.add('active');
            }
        });
    };

    // Initial check
    revealOnScroll();

    // Check on scroll
    window.addEventListener('scroll', revealOnScroll);
}

// Form submission handling
function initFormSubmit() {
    const form = document.getElementById('signup-form');

    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            const email = form.querySelector('input[type="email"]').value;
            const button = form.querySelector('button');
            const originalText = button.innerHTML;

            // Animate button
            button.innerHTML = `
                <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
                </svg>
                Processing...
            `;
            button.disabled = true;

            // Add spinner animation
            const style = document.createElement('style');
            style.textContent = `
                .spinner {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);

            // Simulate API call
            setTimeout(() => {
                button.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 13l4 4L19 7"/>
                    </svg>
                    You're on the list!
                `;
                button.style.background = 'linear-gradient(135deg, #00cc6a 0%, #00ff88 100%)';

                // Reset after delay
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = false;
                    button.style.background = '';
                    form.reset();
                }, 3000);
            }, 1500);
        });
    }
}

// Parallax effect for stars
function initParallaxStars() {
    const stars = document.querySelector('.stars');

    if (stars) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            stars.style.transform = `translateY(${scrolled * 0.3}px)`;
        });
    }
}

// Counter animation for stats
function initCounterAnimation() {
    const stats = document.querySelectorAll('.stat-number');

    const animateCounter = (element) => {
        const text = element.textContent;
        const hasNumber = text.match(/\d+/);

        if (!hasNumber) return;

        const number = parseInt(hasNumber[0]);
        const suffix = text.replace(hasNumber[0], '');
        const prefix = text.split(hasNumber[0])[0];

        let current = 0;
        const increment = number / 50;
        const duration = 1500;
        const stepTime = duration / 50;

        const timer = setInterval(() => {
            current += increment;
            if (current >= number) {
                current = number;
                clearInterval(timer);
            }
            element.textContent = prefix + Math.floor(current) + suffix;
        }, stepTime);
    };

    // Create intersection observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => observer.observe(stat));
}

// Add interactive glow effect to cards on mouse move
document.querySelectorAll('.feature-card, .pricing-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
    });
});

// Add typing effect to hero tagline (optional enhancement)
function typeWriter(element, text, speed = 50) {
    let i = 0;
    element.textContent = '';

    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }

    type();
}

// Dynamic aurora intensity based on scroll
window.addEventListener('scroll', () => {
    const scrollPercent = window.pageYOffset / (document.body.scrollHeight - window.innerHeight);
    const auroraElements = document.querySelectorAll('.aurora');

    auroraElements.forEach((aurora, index) => {
        const baseOpacity = 0.15 + (index * 0.05);
        const dynamicOpacity = baseOpacity + (scrollPercent * 0.1);
        aurora.style.opacity = Math.min(dynamicOpacity, 0.4);
    });
});

// Add keyboard navigation for accessibility
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        document.body.classList.add('keyboard-nav');
    }
});

document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-nav');
});

// Preload optimization - add loading state
window.addEventListener('load', () => {
    document.body.classList.add('loaded');

    // Trigger initial animations
    setTimeout(() => {
        document.querySelectorAll('.hero-content > *').forEach((el, index) => {
            el.style.animationDelay = `${index * 0.1}s`;
            el.classList.add('fade-in-up');
        });
    }, 100);
});

// Add CSS for fade-in animation
const animationStyles = document.createElement('style');
animationStyles.textContent = `
    .fade-in-up {
        animation: fadeInUp 0.6s ease forwards;
    }

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .keyboard-nav *:focus {
        outline: 2px solid var(--aurora-green) !important;
        outline-offset: 2px;
    }
`;
document.head.appendChild(animationStyles);
