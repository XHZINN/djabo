// Exemplo usando vanilla JS
document.getElementById('preco').addEventListener('input', function(e) {
    let value = this.value.replace(/\D/g, '');
    this.value = (value/100).toFixed(2).replace('.', ',');
});