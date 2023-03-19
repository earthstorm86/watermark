$(document).ready(function() {

    const imageInput = $('#image-input');
    const watermarkInput = $('#watermark-input');
    const positionSelect = $('#position-select');
    const scaleRange = $('#scale-range');
    const opacityRange = $('#opacity-range');
    const paddingRange = $('#padding-input');
    const opacityDisplay = $('#opacity-display');
	const fancyboxContainer = $('<div style="display: none;"></div>');
    const confirmButton = $('#confirm-button');
    const scaleDisplay = $('#scale-display');
    const watermarkPixelSize = $('<p>');
    let isUpdatingPreview = false;
    positionSelect.on("change", interruptAndUpdatePreview);
    scaleRange.on("input", interruptAndUpdatePreview);
    opacityRange.on("input", interruptAndUpdatePreview);
    paddingRange.on("input", interruptAndUpdatePreview);
	imageInput.on("change", updatePreviewIfFilesExist);
	watermarkInput.on("change", updatePreviewIfFilesExist);


    positionSelect.on('change', function() {
        saveSettings();
    });

    scaleRange.on('input', function() {
        const percentage = (parseFloat($(this).val()) * 100).toFixed(0);
        scaleDisplay.text(`${percentage}%`);
        saveSettings();
    });

    opacityRange.on('input', function() {
        const percentage = (parseFloat($(this).val()) * 100).toFixed(0);
        opacityDisplay.text(`${percentage}%`);
        saveSettings();
    });

    paddingRange.on('input', function() {
        saveSettings();
        updatePreview();
    });

    confirmButton.on('click', function() {
        processImages();
    });
    positionSelect.on("change", updatePreview);
    scaleRange.on("input", updatePreview);
    opacityRange.on("input", updatePreview);
    loadSettings();

    async function processImages() {
        const position = positionSelect.val();
        const scale = parseFloat(scaleRange.val());
        const opacity = parseFloat(opacityRange.val());
        const padding = parseInt(paddingRange.val());

        if (!imageInput[0].files.length || !watermarkInput[0].files.length) {
            alert('Please select both image(s) and a watermark.');
            return;
        }

        const watermarkImg = await loadImageFromFile(watermarkInput[0].files[0]);
        const scaledWatermark = scaleImage(watermarkImg, scale);

        const zip = new JSZip();

        $('#loader').css('display', 'flex');
        $('body').css('pointer-events', 'none');

        const totalImages = imageInput[0].files.length;
        let processedImages = 0;


        for (const file of imageInput[0].files) {
            const img = await loadImageFromFile(file);
            //const watermarkedDataURL = addWatermark(img, scaledWatermark, position);
            const watermarkedDataURL = addWatermark(img, watermarkImg, position, scale, opacity, padding);
            const base64Data = watermarkedDataURL.split(',')[1];
            zip.file(`watermarked_${file.name}`, base64Data, {
                base64: true
            });

            // Update progress value
            processedImages++;
            const progressValue = (processedImages / totalImages) * 100;
            $('#progress').val(progressValue);
            $('#progress-value').text(`${progressValue.toFixed(0)}%`);
        }

        const zipBlob = await zip.generateAsync({
            type: 'blob'
        });
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(zipBlob);
        downloadLink.download = 'watermarked_images.zip';
        downloadLink.textContent = `Download ${downloadLink.download}`;
        $('#loader').css('display', 'none');
        $('body').css('pointer-events', 'auto');
        fancyboxContainer.append(downloadLink);
		$('body').append(fancyboxContainer);
		$.fancybox.open({
		  src: fancyboxContainer,
		  type: 'inline',
		  opts: {
			afterClose: function () {
			  fancyboxContainer.remove();
			},
		  },
		});

    }

    function loadImageFromFile(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = URL.createObjectURL(file);
        });
    }

    function scaleImage(img, scale) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const scaledImg = new Image();
        scaledImg.src = canvas.toDataURL('image/png');
        return scaledImg;
    }

    function addWatermark(img, watermark, position, scale, opacity, padding) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Set global alpha to control watermark transparency
        ctx.globalAlpha = opacity;

        //New scale type
        const scaledWatermark = scaleWatermark(watermark, canvas.width, canvas.height);
        const paddedWatermark = addPaddingToWatermark(scaledWatermark, padding);

        const watermarkWidth = paddedWatermark.width;
        const watermarkHeight = paddedWatermark.height;


        // Calculate the new width and height of the watermark based on the image's width and the given scale
        //const watermarkWidth = img.width * scale;
        // const watermarkHeight = (watermark.height * watermarkWidth) / watermark.width;

        if (position === 'tile') {
            for (let x = 0; x < img.width; x += watermarkWidth) {
                for (let y = 0; y < img.height; y += watermarkHeight) {
                    ctx.drawImage(paddedWatermark, x, y, watermarkWidth, watermarkHeight);
                }
            }
        } else {
            let x, y;

            switch (position) {
                case 'topleft':
                    x = 0;
                    y = 0;
                    break;
                case 'topright':
                    x = img.width - watermarkWidth;
                    y = 0;
                    break;
                case 'bottomleft':
                    x = 0;
                    y = img.height - watermarkHeight;
                    break;
                case 'bottomright':
                    x = img.width - watermarkWidth;
                    y = img.height - watermarkHeight;
                    break;
            }

            ctx.drawImage(paddedWatermark, x, y, watermarkWidth, watermarkHeight);
        }
        ctx.globalAlpha = 1;
        return canvas.toDataURL('image/png');
    }


    // Display the opacity percentage for the opacity range
    opacityRange.on('input', function() {
        const percentage = (parseFloat($(this).val()) * 100).toFixed(0);
        opacityDisplay.text(`${percentage}%`);
    });


    function saveSettings() {
        const settings = {
            position: positionSelect.val(),
            scale: scaleRange.val(),
            opacity: opacityRange.val(),
            padding: paddingRange.val(),
        };
        localStorage.setItem('watermarkSettings', JSON.stringify(settings));
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem('watermarkSettings');

        if (savedSettings) {
            const settings = JSON.parse(savedSettings);

            positionSelect.val(settings.position);
            scaleRange.val(settings.scale);
            opacityRange.val(settings.opacity);
            paddingRange.val(settings.padding);


            // Update the UI to display the correct percentage values
            const scalePercentage = (parseFloat(settings.scale) * 100).toFixed(0);
            scaleDisplay.text(`${scalePercentage}%`);

            const opacityPercentage = (parseFloat(settings.opacity) * 100).toFixed(0);
            opacityDisplay.text(`${opacityPercentage}%`);

        }
    }

    function scaleWatermark(watermark, imageWidth, imageHeight) {
        const scale = parseFloat(scaleRange.val());

        // Calculate the geometric mean of the image dimensions
        const imageDimensionMean = Math.sqrt(imageWidth * imageHeight);

        // Calculate the scale factor based on the geometric mean
        const scaleFactor = (imageDimensionMean * scale) / Math.sqrt(watermark.width * watermark.height);

        // Calculate the new watermark width and height while maintaining the aspect ratio
        const newWidth = watermark.width * scaleFactor;
        const newHeight = watermark.height * scaleFactor;

        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(watermark, 0, 0, newWidth, newHeight);

        return canvas;
    }

    async function updatePreview() {
        if (isUpdatingPreview) {
            return;
        }

        isUpdatingPreview = true;

        const imageFiles = imageInput.get(0).files;
        if (imageFiles.length === 0) {
            isUpdatingPreview = false;
            return;
        }

        if (imageFiles.length === 0) return;

        const firstImage = await loadImage(imageFiles[0]);
        const watermarkImage = await loadImage(watermarkInput.get(0).files[0]);
        const position = positionSelect.val();
        const scale = parseFloat(scaleRange.val());
        const opacity = parseFloat(opacityRange.val());
        const padding = parseFloat(paddingRange.val());

        const watermarkedImageBlob = await addWatermarkAsBlob(firstImage, watermarkImage, position, scale, opacity, padding);


        if (!isUpdatingPreview) {
            return;
        }

        const previewCanvas = document.getElementById("preview-canvas");
        const ctx = previewCanvas.getContext("2d");
        previewCanvas.width = firstImage.width;
        previewCanvas.height = firstImage.height;

        const previewImage = await createImageBitmap(watermarkedImageBlob);
        ctx.drawImage(previewImage, 0, 0);

        isUpdatingPreview = false;
    }


    function loadImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const image = new Image();
                image.onload = () => {
                    resolve(image);
                };
                image.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }


    async function addWatermarkAsBlob(img, watermark, position, scale, opacity, padding) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Set global alpha to control watermark transparency
        ctx.globalAlpha = opacity;

        // New scale type
        const scaledWatermark = scaleWatermark(watermark, canvas.width, canvas.height);
        const paddedWatermark = addPaddingToWatermark(scaledWatermark, padding);

        const watermarkWidth = paddedWatermark.width;
        const watermarkHeight = paddedWatermark.height;

        if (position === 'tile') {
            for (let x = 0; x < img.width; x += watermarkWidth) {
                for (let y = 0; y < img.height; y += watermarkHeight) {
                    ctx.drawImage(paddedWatermark, x, y, watermarkWidth, watermarkHeight);
                }
            }
        } else {
            let x, y;

            switch (position) {
                case 'topleft':
                    x = 0;
                    y = 0;
                    break;
                case 'topright':
                    x = img.width - watermarkWidth;
                    y = 0;
                    break;
                case 'bottomleft':
                    x = 0;
                    y = img.height - watermarkHeight;
                    break;
                case 'bottomright':
                    x = img.width - watermarkWidth;
                    y = img.height - watermarkHeight;
                    break;
            }

            ctx.drawImage(paddedWatermark, x, y, watermarkWidth, watermarkHeight);
        }
        ctx.globalAlpha = 1;

        // Convert the canvas to a Blob
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    }

    function addPaddingToWatermark(watermark, padding) {
        const paddedCanvas = document.createElement('canvas');
        paddedCanvas.width = watermark.width + 2 * padding;
        paddedCanvas.height = watermark.height + 2 * padding;
        const ctx = paddedCanvas.getContext('2d');

        ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
        ctx.drawImage(watermark, padding, padding, watermark.width, watermark.height);

        return paddedCanvas;
    }

    function interruptAndUpdatePreview() {
        isUpdatingPreview = false;
        updatePreview();
    }
	
	function updatePreviewIfFilesExist() {
	  const imageFiles = imageInput.get(0).files;
	  const watermarkFiles = watermarkInput.get(0).files;

	  if (imageFiles.length > 0 && watermarkFiles.length > 0) {
		updatePreview();
	  }
	}

});