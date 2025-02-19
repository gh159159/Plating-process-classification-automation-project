from flask import Blueprint, request, jsonify
from kafka import KafkaProducer
import json
from datetime import datetime

kafka_route = Blueprint('kafka', __name__)

# Kafka 프로듀서 설정
KAFKA_BOOTSTRAP_SERVERS = '5gears.iptime.org:9092'  # Kafka 서버 주소
KAFKA_TOPIC_LOGS = 'logs'        # 로그용 토픽
KAFKA_TOPIC_IMAGES = 'kafka-ig'    # 이미지용 토픽

try:
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8'),
        key_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

except Exception as e:
    print(f"Kafka 연결 실패: {str(e)}")
    producer = None



# 로그 전송
@kafka_route.route('/logs', methods=['POST'])
def send_log_to_kafka():
    try:
        if not producer: 
            return jsonify({
                'status': 'error',
                'message': 'Kafka 서버에 연결할 수 없습니다.'
            }), 500

        log_data = request.json
        log_data['server_timestamp'] = datetime.now().isoformat()
        
        future = producer.send(
            topic=KAFKA_TOPIC_LOGS,
            key=log_data['pltNumber'],
            value=log_data
        )
        future.get(timeout=10)
        
        return jsonify({
            'status': 'success',
            'message': '로그가 성공적으로 전송되었습니다.'
        })

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'로그 전송 실패: {str(e)}'
        }), 500




# 이미지 전송
@kafka_route.route('/kafka-ig', methods=['POST'])
def send_image_to_kafka():
    try:
        if not producer:
            return jsonify({
                'status': 'error',
                'message': 'Kafka 서버에 연결할 수 없습니다.'
            }), 500

        image_data = request.json
        image_data['server_timestamp'] = datetime.now().isoformat()
        
        future = producer.send(
            topic=KAFKA_TOPIC_IMAGES,
            key=image_data['pltNumber'],
            value=image_data
        )
        future.get(timeout=10)
        
        return jsonify({
            'status': 'success',
            'message': '이미지가 성공적으로 전송되었습니다.'
        })

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'이미지 전송 실패: {str(e)}'
        }), 500