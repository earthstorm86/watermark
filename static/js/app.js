$(document).ready(function() {

    const imageInput = $('#image-input');
    const watermarkInput = $('#watermark-input');
    const positionSelect = $('#position-select');
    const scaleRange = $('#scale-range');
    const opacityRange = $('#opacity-range');
    const paddingRange = $('#padding-input');
    const opacityDisplay = $('#opacity-display');
    const confirmButton = $('#confirm-button');
    const scaleDisplay = $('#scale-display');
	const downloads =$('#downloads');
    const watermarkPixelSize = $('<p>');
	var selectedWatermarkBase64String;
	let selectedWatermarkFile = null;  // declare this at a scope accessible by both functions
	let watermarkedImages = [];
    let isUpdatingPreview = false;
    positionSelect.on("change", interruptAndUpdatePreview);
    scaleRange.on("input", interruptAndUpdatePreview);
    opacityRange.on("input", interruptAndUpdatePreview);
    paddingRange.on("input", interruptAndUpdatePreview);
	imageInput.on("change", updatePreview);
	watermarkInput.on("change", updatePreviewIfFilesExist);
	
	
	$('#download-all-button').click(downloadAllAsZip);

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
        const padding = parseInt($(this).val());
		paddingRange.text(`${percentage}%`);
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

		const watermarkThumbnails = $('#watermark-thumbnails').children();

		if (!imageInput[0].files.length && ((!watermarkInput[0].files.length || !watermarkThumbnails.length))) {
			alert('Please select both image(s) and a watermark.');
			return;
		}

		let watermarkImg;
		
		if (selectedWatermarkBase64String) {
			const watermarkFile = base64StringToFile(selectedWatermarkBase64String, 'watermark.png');
			watermarkImg = await loadImageFromFile(watermarkFile);
		} else {
			watermarkImg = await loadImageFromFile(watermarkInput[0].files[0]);
		}

		const scaledWatermark = scaleImage(watermarkImg, scale);

		const zip = new JSZip();

		$('#loader').css('display', 'flex');
		$('body').css('pointer-events', 'none');

		const totalImages = imageInput[0].files.length;
		let processedImages = 0;
		watermarkedImages = [];

		for (const file of imageInput[0].files) {
			let imageFile = file;

			// If the file type is WebP, convert it to PNG
			if(file.type === "image/webp") {
				imageFile = await convertWebPtoPNG(file);
			}

			const img = await loadImageFromFile(imageFile);
			const watermarkedCanvas = addWatermark(img, watermarkImg, position, scale, opacity, padding);
			const watermarkedBlob = await new Promise((resolve) => watermarkedCanvas.toBlob(resolve, 'image/png'));
			const watermarkedDataURL = URL.createObjectURL(watermarkedBlob);

			const base64Data = watermarkedDataURL.split(',')[1];
			zip.file(`watermarked_${imageFile.name}`, base64Data, {
				base64: true
			});

			watermarkedImages.push({
				name: imageFile.name,
				blob: watermarkedBlob
			});

			// Update progress value
			processedImages++;
			const progressValue = (processedImages / totalImages) * 100;
			$('#progress').val(progressValue);
			$('#progress-value').text(`${progressValue.toFixed(0)}%`);

			createDownloadButtons();
		}

		const zipBlob = await zip.generateAsync({
			type: 'blob'
		});
		const downloadLink = document.createElement('a');
		downloadLink.href = URL.createObjectURL(zipBlob);
		downloadLink.download = 'watermarked_images.zip';
		downloadLink.textContent = `Download ${downloadLink.download}`;
		downloads.show();

		$('#loader').css('display', 'none');
		$('body').css('pointer-events', 'auto');
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
        return canvas;
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

    let watermarkImage = null;
    
    // If watermark is selected in the thumbnails
    if (selectedWatermarkBase64String) {
        try {
            // Convert the Base64 string back to a File
            const watermarkFile = base64StringToFile(selectedWatermarkBase64String, 'watermark.png');
            watermarkImage = await loadImage(watermarkFile);
        } catch (error) {
            console.error(error);
            isUpdatingPreview = false;
            return;
        }
    }

    const firstImage = await loadImage(imageFiles[0]);

    const position = positionSelect.val();
    const scale = parseFloat(scaleRange.val());
    const opacity = parseFloat(opacityRange.val());
    const padding = parseFloat(paddingRange.val());

    let watermarkedImageBlob = firstImage;
    if (watermarkImage) {
        watermarkedImageBlob = await addWatermarkAsBlob(firstImage, watermarkImage, position, scale, opacity, padding);
    }

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

function base64StringToFile(base64String, filename) {
    const arr = base64String.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}


	function loadImage(input) {
		return new Promise((resolve, reject) => {
			if (input instanceof Blob || input instanceof File) {
				const reader = new FileReader();
				reader.onload = (event) => {
					const image = new Image();
					image.onload = () => {
						resolve(image);
					};
					image.src = event.target.result;
				};
				reader.readAsDataURL(input);
			} else {
				reject(new Error("Invalid input: expected a Blob or File"));
			}
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
	
	function createDownloadButtons() {
	  const container = $('#download-buttons-container');
	  container.empty();

	  watermarkedImages.forEach((image, index) => {
		const button = $('<button>')
		  .addClass('download-button')
		  .text(`Download ${image.name}`)
		  .click(() => {
			downloadImage(image);
		  });
		container.append(button);
	  });
	}
	
	function downloadImage(image) {
	  const link = document.createElement('a');
	  link.href = URL.createObjectURL(image.blob);
	  link.download = `watermarked-${image.name}`;
	  document.body.appendChild(link);
	  link.click();
	  document.body.removeChild(link);
	}
	
	async function downloadAllAsZip() {
	  const zip = new JSZip();

	  watermarkedImages.forEach((image) => {
		zip.file(`watermarked-${image.name}`, image.blob);
	  });

	  const zipBlob = await zip.generateAsync({ type: 'blob' });

	  const link = document.createElement('a');
	  link.href = URL.createObjectURL(zipBlob);
	  link.download = 'watermarked-images.zip';
	  document.body.appendChild(link);
	  link.click();
	  document.body.removeChild(link);
	}
	
	function blobToBase64(blob) {
	  return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	  });
	}
		
	async function loadWatermarkFromSession() {
		const savedWatermarkBase64String = localStorage.getItem("watermarkImage");

		// Only load the watermark from local storage if the user has not provided a file
		if (savedWatermarkBase64String && watermarkInput[0].files.length === 0) {
			const response = await fetch(savedWatermarkBase64String);
			const blob = await response.blob();

			const file = new File([blob], "watermark.png", { type: "image/png" });
			Object.defineProperty(watermarkInput[0], "files", {
				value: [file],
				writable: false,
			});
		}
	}



function createThumbnail(base64String) {
  // Create new img element and set its src attribute
  var newThumbnail = document.createElement('img');
  newThumbnail.src = base64String;

  newThumbnail.onload = function() {
    // Set class and onclick handler after the image is loaded
    newThumbnail.classList.add('watermark-thumbnail');
    newThumbnail.onclick = handleThumbnailClick;

    // Create new div for the thumbnail and remove button
    var thumbnailContainer = document.createElement('div');
    thumbnailContainer.classList.add('thumbnail-container');

    // Create remove button
    var removeButton = document.createElement('button');
    removeButton.innerHTML = "X";
    removeButton.classList.add('remove-thumbnail');

    // Handle the click event for the remove button
    removeButton.onclick = function(e) {
      e.stopPropagation(); // Prevent the thumbnail click event

      // Remove the watermark from savedWatermarksBase64Strings
      var index = savedWatermarksBase64Strings.indexOf(base64String);
      if (index !== -1) {
        savedWatermarksBase64Strings.splice(index, 1);
      }
      localStorage.setItem('savedWatermarksBase64Strings', JSON.stringify(savedWatermarksBase64Strings));

      // Remove the thumbnail from the DOM
      thumbnailContainer.remove();

      // If this thumbnail was selected, deselect it
      if (selectedWatermarkBase64String === base64String) {
        selectedWatermarkBase64String = null;
        updatePreview();
      }
    };

    // Append the thumbnail and the remove button to the container
    thumbnailContainer.appendChild(newThumbnail);
    thumbnailContainer.appendChild(removeButton);

    var thumbnailsContainer = document.getElementById('watermark-thumbnails');
    thumbnailsContainer.appendChild(thumbnailContainer);

    // Select the new thumbnail
    unselectWatermarkThumbnails();
    newThumbnail.classList.add('selected');
    selectedWatermarkBase64String = base64String;
    updatePreview();
  };
}

document.getElementById('watermark-input').addEventListener('change', function(e) {
  var file = e.target.files[0];
  var reader = new FileReader();

  reader.onloadend = function() {
    var base64String = reader.result;

    var savedWatermarksBase64Strings = JSON.parse(localStorage.getItem('savedWatermarksBase64Strings')) || [];
    if (!savedWatermarksBase64Strings.includes(base64String)) {
      savedWatermarksBase64Strings.push(base64String);
      localStorage.setItem('savedWatermarksBase64Strings', JSON.stringify(savedWatermarksBase64Strings));
      
      createThumbnail(base64String);
    }
  }

  reader.readAsDataURL(file);
});

// Create thumbnails for existing watermarks when the page loads
var savedWatermarksBase64Strings = JSON.parse(localStorage.getItem('savedWatermarksBase64Strings')) || [];
savedWatermarksBase64Strings.forEach(createThumbnail);


function unselectWatermarkThumbnails() {
  var thumbnails = document.getElementsByClassName('watermark-thumbnail');
  for (var i = 0; i < thumbnails.length; i++) {
    thumbnails[i].classList.remove('selected');
  }
}

function handleThumbnailClick(event) {
  var clickedThumbnail = event.target;

  // Unselect other thumbnails
  unselectWatermarkThumbnails();

  // Select the clicked thumbnail
  clickedThumbnail.classList.add('selected');

  // Update the selected watermark
  selectedWatermarkBase64String = clickedThumbnail.src;

  // Update the preview
  updatePreview();
}




async function handleWatermarkThumbnailClick(e) {
// Remove 'selected-thumbnail' class from all watermark thumbnails
  const thumbnails = document.getElementsByClassName('watermark-thumbnail');
  for (let i = 0; i < thumbnails.length; i++) {
    thumbnails[i].classList.remove('selected-thumbnail');
  }

  // Add 'selected-thumbnail' class to the clicked thumbnail
  e.target.classList.add('selected-thumbnail');

  // The rest of the code remains the same
  const selectedWatermarkIndex = parseInt(e.target.dataset.index, 10);
  const savedWatermarksBase64Strings = JSON.parse(localStorage.getItem('savedWatermarksBase64Strings')) || [];
  const selectedWatermarkBase64String = savedWatermarksBase64Strings[selectedWatermarkIndex];


  if (selectedWatermarkBase64String) {
    const response = await fetch(selectedWatermarkBase64String);
    let blob = await response.blob();
    let file;

    if (blob.type === "image/webp") {
      file = await convertWebPtoPNG(blob);
    } else {
      file = new File([blob], "watermark.png", { type: "image/png" });
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    watermarkInput[0].files = dataTransfer.files;

    // Call updatePreview to refresh the image with the new watermark
    updatePreview();
  }
}




async function handleWatermarkSelectionChange() {
    const selectedWatermarkIndex = $("#watermark-select").val();
    const savedWatermarksBase64Strings = JSON.parse(localStorage.getItem('savedWatermarksBase64Strings')) || [];
    const selectedWatermarkBase64String = savedWatermarksBase64Strings[selectedWatermarkIndex];
	

    if (selectedWatermarkBase64String) {
        const response = await fetch(selectedWatermarkBase64String);
        let blob = await response.blob();

        let file;
        if (blob.type === "image/webp") {
          file = await convertWebPtoPNG(blob);
        } else {
          file = new File([blob], "watermark.png", { type: "image/png" });
        }

        selectedWatermarkFile = file;  // store the file in the new variable

        // Call updatePreview to refresh the image with the new watermark
        updatePreview();
    }
}



async function loadWatermarkFromSession() {
    const savedWatermarkBase64String = localStorage.getItem("watermarkImage");

    // Only load the watermark from local storage if the user has not provided a file
    if (savedWatermarkBase64String && watermarkInput[0].files.length === 0) {
        const response = await fetch(savedWatermarkBase64String);
        const blob = await response.blob();

        const file = new File([blob], "watermark.png", { type: "image/png" });
        Object.defineProperty(watermarkInput[0], "files", {
            value: [file],
            writable: false,
        });
        // Check if there's an image already loaded
        if (imageInput[0].files.length > 0) {
            // Update the preview if there is
            updatePreview();
        }
    }
}




function convertWebPtoPNG(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function (event) {
      const img = new Image();
      img.src = event.target.result;
      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(function(blob) {
          // Replace the original file's extension with .png
          const filename = file.name.replace(/\.[^/.]+$/, "") + ".png";
          const newFile = new File([blob], filename, {type: "image/png"});
          resolve(newFile);
        }, 'image/png');
      }
      img.onerror = error => reject(error);
    }
    reader.onerror = error => reject(error);
  });
}

$(document).ready(function () {
    loadWatermarkFromSession();
    // rest of your code
});


$('#image-input').on('change', async function () {
    let files = Array.from(this.files);

    const conversionPromises = files.map(async (file, i) => {
        if(file.type === 'image/webp') {
            try {
                const pngFile = await convertWebPtoPNG(file);
                files[i] = pngFile; // replace the original file with the converted PNG
            } catch(error) {
                console.error('Error converting WebP image to PNG: ', error);
            }
        }
    });

    // wait for all the conversions to finish
    await Promise.all(conversionPromises);

    // now continue processing the 'files' array as normal...
});
	
});
