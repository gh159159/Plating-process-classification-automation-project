$(document).ready(function () {

    const BELT = $(".belt");
    
    // 파이프 검사 설정
    const SETTINGS = {
        beltSpeed: 20,
        loadInterval: 10000,
        startPosition: -800
    };

    // 이미지 처리 설정 & 로그 설정
    const processedImages = new Set();
    const LOG_SETTINGS = {
        maxLogItems: 3,
        logContainer: '#log-list'
    };
    
    // 이미지 로드 & 애니메이션
    function loadAndAnimateImage() {
        fetch('/api/images/images', {
            method: 'POST',
            headers: {'Content-Type': 'application/json',}
        })
        .then(res => res.ok ? res.json() : Promise.reject('HTTP 오류'))
        .then(data => {
            if (data.status === 'success' && !processedImages.has(data.plt_number)) {
                const $img = $(`<img src="${data.image}" />`);
                $img.data('plt_number', data.plt_number);
                BELT.append($img);
                animateImage($img);
                processedImages.add(data.plt_number);
                
                setTimeout(() => {
                    processedImages.delete(data.plt_number);
                }, SETTINGS.beltSpeed * 1000 * 2);
            }
        })
        .catch(err => setTimeout(loadAndAnimateImage, 7000));
    }

    // 이미지 애니메이션
    function animateImage($img) {
        $img.on('load', function() {
            $(this).css({
                position: "absolute",
                transform: `translateX(${SETTINGS.startPosition}px)`,
                transition: `transform ${SETTINGS.beltSpeed}s linear`
            });
            
            requestAnimationFrame(() => {
                $(this).css("transform", `translateX(${window.innerWidth + 1000}px)`);
            });
        });
    }

    // 이미지 검출 영역 탐지
    function detectPosition() {
        const detectionZone = document.querySelector('.detection-zone');
        const zoneLeft = detectionZone.getBoundingClientRect().left;
        const zoneRight = detectionZone.getBoundingClientRect().right;
    
        function checkPositions() {
            $('.belt img').each(function () {
                const $img = $(this);
                const imgRect = this.getBoundingClientRect();
    
                if (imgRect.left <= zoneRight && imgRect.right >= zoneLeft && !$img.data('processed')) {
                    processImage($img);
                    $img.data('processed', true);
                }
    
                if (imgRect.left > zoneRight && $img.data('processed')) {
                    setTimeout(() => {
                        $img.fadeOut(1000, function () {
                            $(this).remove();
                        });
                    }, 2000);
                }
            });
            requestAnimationFrame(checkPositions);
        }
    
        requestAnimationFrame(checkPositions);
    }    

    // 로그 추가
    async function addLog(type, message, pltNumber) {
        // UI에 로그 추가
        const logItem = document.createElement('li');
        logItem.className = type === 'warning' ? 'defect' : '';
        logItem.innerHTML = `
            <span class="log-time">[${new Date().toLocaleString('ko-KR')}]</span>
            <span class="log-plt">[PLT: ${pltNumber}]</span>
            ${message}
        `;

        const logList = document.getElementById('log-list');
        logList.insertBefore(logItem, logList.firstChild);

        while (logList.children.length > LOG_SETTINGS.maxLogItems) {
            logList.removeChild(logList.lastChild);
        }

        // Kafka로 로그 전송
        try {
            await fetch('/api/logs/logs', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    message: message,
                    pltNumber: pltNumber,
                    
                })
            });
        } catch (error) {
            console.error('Kafka 로그 전송 실패:', error);
        }
    }

    // 이미지 처리
    async function processImage($img) {
        const pltNumber = $img.data('plt_number');
        try {
            // Add processing class to the image
            $img.addClass('processing');

            // Fetch pipe inspection result
            const res = await fetch('/api/pipe/pipe', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    image_base64: getBase64Data($img.attr('src')),
                    plt_number: pltNumber
                }),
            });

            const result = await res.json();

            // Kafka log transmission for original image
            await fetch('/api/logs/kafka-ig', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    message: '이미지 데이터',
                    pltNumber: pltNumber,
                    image: getBase64Data($img.attr('src'))
                })
            });

            // Update image and handle predictions
            updateImageWithResult($img, result, pltNumber);
        } catch (error) {
            console.error('Error during image processing:', error);
            addLog('error', `검사 실패`, pltNumber);
            $img.removeClass('processing');
        }
    }

    // Helper function to extract base64 data safely
    function getBase64Data(src) {
        if (src.includes('base64,')) {
            return src.split('base64,')[1];
        }
        throw new Error('Invalid image source format');
    }

    // Function to update the image and handle predictions
    function updateImageWithResult($img, result, pltNumber) {
        requestAnimationFrame(async () => {
            $img.attr('src', `data:image/png;base64,${result.annotated_image}`)
                .removeClass('processing');

            const defect = result.predictions.find(p => p.label === 'Defect');
            if (defect) {
                // Log defect and show alert
                addLog('warning', '불량품', pltNumber);
                Swal.fire({
                    icon: "warning",
                    title: "불량품 감지!",
                    text: `파이프 번호: ${pltNumber}`,
                    confirmButtonText: "확인",
                    timer: 2000,
                    timerProgressBar: true,
                    customClass: { timerProgressBar: "timer-bar" }
                });

                // Send Slack notification for defect
                try {
                    await fetch('/api/slack', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image_base64: result.annotated_image,
                            label: defect.label,
                            confidence: defect.confidence,
                        }),
                    });
                } catch (slackError) {
                    console.error('Error sending Slack notification:', slackError);
                }
            } else {
                addLog('info', '정상품', pltNumber);
            }
        });
    }

    loadAndAnimateImage();
    setInterval(loadAndAnimateImage, SETTINGS.loadInterval);
    detectPosition();
});

