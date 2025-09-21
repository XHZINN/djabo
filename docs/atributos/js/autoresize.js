document.querySelectorAll('.auto-resize').forEach(textarea => {
    // Função de auto-ajuste
    function ajustarAltura() {
        this.style.height = 'auto'; // Reseta a altura
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    }

    // Aplica no carregamento e durante a digitação
    ajustarAltura.call(textarea);
    textarea.addEventListener('input', ajustarAltura);
});