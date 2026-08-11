import React, { useRef, useState, useEffect } from 'react';

export default function SignaturePad({ value, onChange, label = 'Assinatura Digital' }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(Boolean(value));
  const [mode, setMode] = useState('draw'); // 'draw' or 'upload' or 'text'
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Set line styles
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';

    // If value changes from outside, draw it if data URL
    if (value && typeof value === 'string' && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setHasSignature(true);
      };
      img.src = value;
    }
  }, [value, mode]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    if (e) e.preventDefault();
    setIsDrawing(false);
    saveSignature();
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    if (onChange) {
      onChange(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setTypedName('');
    if (onChange) {
      onChange('');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl === 'string') {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            setHasSignature(true);
            if (onChange) onChange(canvas.toDataURL('image/png'));
          }
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTypedSignature = (text) => {
    setTypedName(text);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!text.trim()) {
      setHasSignature(false);
      if (onChange) onChange('');
      return;
    }

    ctx.font = 'italic bold 28px "Caveat", "Dancing Script", "Brush Script MT", cursive, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    setHasSignature(true);
    if (onChange) onChange(canvas.toDataURL('image/png'));
  };

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b' }}>
          ✍️ {label}
        </label>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className={`btn btn-xs ${mode === 'draw' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('draw')}
            style={{ fontSize: '11px' }}
          >
            ✏️ Desenhar
          </button>
          <button
            type="button"
            className={`btn btn-xs ${mode === 'text' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('text')}
            style={{ fontSize: '11px' }}
          >
            ⌨️ Digitar Nome
          </button>
          <button
            type="button"
            className={`btn btn-xs ${mode === 'upload' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('upload')}
            style={{ fontSize: '11px' }}
          >
            📁 Carregar Imagem
          </button>
        </div>
      </div>

      {mode === 'text' && (
        <div style={{ marginBottom: '8px' }}>
          <input
            type="text"
            className="input input-sm w-full"
            placeholder="Digite o nome para gerar assinatura estilizada..."
            value={typedName}
            onChange={(e) => handleTypedSignature(e.target.value)}
            style={{ border: '1px solid #94a3b8' }}
          />
        </div>
      )}

      {mode === 'upload' && (
        <div style={{ marginBottom: '8px' }}>
          <input
            type="file"
            accept="image/*"
            className="file-input file-input-xs file-input-bordered w-full"
            onChange={handleImageUpload}
          />
        </div>
      )}

      <div style={{ position: 'relative', background: '#ffffff', border: '2px dashed #cbd5e1', borderRadius: '6px', cursor: 'crosshair', touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={130}
          style={{ width: '100%', height: '130px', display: 'block' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
            Assine no quadro acima usando o mouse ou tela sensível ao toque
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <span style={{ fontSize: '11px', color: hasSignature ? '#16a34a' : '#d97706', fontWeight: '500' }}>
          {hasSignature ? '✓ Assinatura Digital capturada' : '⚠️ Nenhuma assinatura inserida (Status ficará "Pendente")'}
        </span>
        <button
          type="button"
          className="btn btn-xs btn-ghost text-error"
          onClick={handleClear}
          disabled={!hasSignature}
        >
          🗑️ Limpar
        </button>
      </div>
    </div>
  );
}
