/* Certificate rendering & PNG export (device-local, printable & downloadable) */
(function () {
  'use strict';

  function formatArDate(iso) {
    try {
      return new Intl.DateTimeFormat('ar', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
    } catch (_) {
      return String(iso || '').slice(0, 10);
    }
  }

  function loadImg(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }

  async function downloadCertificatePNG(unit, cert, learnerName) {
    const W = 1600, H = 1120;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }

    // Warm parchment background
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#FFFDF8');
    bg.addColorStop(1, '#F4EBDD');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Double ornamental border (Lapis + Saffron)
    g.strokeStyle = '#2F2B9E';
    g.lineWidth = 10;
    g.strokeRect(42, 42, W - 84, H - 84);
    g.strokeStyle = '#D98B14';
    g.lineWidth = 3;
    g.strokeRect(64, 64, W - 128, H - 128);

    // Corner geometric stars
    const corners = [[64, 64], [W - 64, 64], [64, H - 64], [W - 64, H - 64]];
    for (const [cx, cy] of corners) {
      g.fillStyle = '#F4A62A';
      g.beginPath();
      g.arc(cx, cy, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2F2B9E';
      g.beginPath();
      g.arc(cx, cy, 5, 0, Math.PI * 2);
      g.fill();
    }

    // Header pill
    g.direction = 'rtl';
    g.textAlign = 'center';

    g.fillStyle = '#ECEAFE';
    roundRect(g, W / 2 - 220, 110, 440, 54, 27);
    g.fill();
    g.fillStyle = '#2F2B9E';
    g.font = '700 24px "Baloo Bhaijaan 2", "IBM Plex Sans Arabic", sans-serif';
    g.fillText('رِحلَة — تعلّم الذكاء الاصطناعي بالعربية', W / 2, 146);

    // Title
    g.fillStyle = '#19173A';
    g.font = '800 58px "Baloo Bhaijaan 2", "IBM Plex Sans Arabic", sans-serif';
    g.fillText('شهادة إتمام وحدة تدريبية', W / 2, 255);

    // Subtitle
    g.fillStyle = '#4E4B6E';
    g.font = '400 28px "IBM Plex Sans Arabic", sans-serif';
    g.fillText('تشهد منصة «رحلة» المحلية بأن المتعلّم(ة):', W / 2, 330);

    // Learner Name
    g.fillStyle = '#2F2B9E';
    g.font = '700 62px "Baloo Bhaijaan 2", "IBM Plex Sans Arabic", sans-serif';
    g.fillText(learnerName || cert.name || 'متعلّم رحلة', W / 2, 425);

    // Decorative saffron rule
    g.strokeStyle = '#F4A62A';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(W / 2 - 260, 455);
    g.lineTo(W / 2 + 260, 455);
    g.stroke();

    // Unit line
    g.fillStyle = '#33304F';
    g.font = '400 28px "IBM Plex Sans Arabic", sans-serif';
    g.fillText('قد أتمّ بنجاح متطلبات وبوابات التقييم المستقلة في:', W / 2, 520);

    const trackLabel = unit.track === 'advanced' ? 'المسار المتقدم الاختياري' : 'المسار الأساسي';
    g.fillStyle = '#0B7F80';
    g.font = '700 42px "Baloo Bhaijaan 2", "IBM Plex Sans Arabic", sans-serif';
    g.fillText(`الوحدة ${unit.number}: ${unit.title}`, W / 2, 590);

    g.fillStyle = '#5B5778';
    g.font = '600 24px "IBM Plex Sans Arabic", sans-serif';
    g.fillText(`${trackLabel} · الزمن التقديري للمادة: ${unit.minutes} دقيقة`, W / 2, 640);

    // Draw medal & Fanak if loaded
    const [medal, fanak] = await Promise.all([
      loadImg('assets/icons/certificate.webp'),
      loadImg('assets/characters/fanak_celebrate.webp')
    ]);
    if (medal) g.drawImage(medal, W / 2 - 75, 675, 150, 150);
    if (fanak) g.drawImage(fanak, 130, H - 300, 190, 190);

    // Scope / honesty disclaimer from source materials
    g.fillStyle = '#5B5778';
    g.font = '400 20px "IBM Plex Sans Arabic", sans-serif';
    g.fillText('تثبت هذه الشهادة إتمام التمارين وبوابات المراجعة التعليمية المحلّية على الحالات الافتراضية المعطاة،', W / 2, 885);
    g.fillText('ولا تمثّل اعتماداً مهنياً رسمياً أو ضماناً لصحة مخرجات أي أداة ذكاء اصطناعي حية.', W / 2, 918);

    // Metadata footer
    g.fillStyle = '#2F2B9E';
    g.font = '600 22px "IBM Plex Sans Arabic", sans-serif';
    g.textAlign = 'right';
    g.fillText(`تاريخ الإصدار: ${formatArDate(cert.issuedAt)}`, W - 120, H - 105);
    g.textAlign = 'left';
    g.fillText(`رمز التوثيق المحلي: ${cert.serial}`, 340, H - 105);

    const url = c.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `rihla-certificate-${unit.id}-${cert.serial}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  window.Cert = { formatArDate, downloadCertificatePNG };
})();
