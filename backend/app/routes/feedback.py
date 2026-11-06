"""
Feedback route — sends farmer feedback to the team email.
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from app import db
from app.models import Feedback

feedback_bp = Blueprint('feedback', __name__)

FEEDBACK_EMAIL = 'mohamed.shaw81756@njala.edu.sl'


@feedback_bp.route('/send', methods=['POST'])
def send_feedback():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    name    = str(data.get('name') or 'Anonymous').strip()[:120]
    email   = str(data.get('email') or '').strip()[:160]
    subject = str(data.get('subject') or 'SmartAgri Feedback').strip()[:200]
    message = str(data.get('message') or '').strip()[:5000]

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        ident = get_jwt_identity()
        user_id = int(ident) if ident else None
    except Exception:
        user_id = None

    record = Feedback(user_id=user_id, name=name, email=email, subject=subject, message=message)
    db.session.add(record)
    db.session.commit()   # always stored in the database first

    body = (f"SmartAgric Feedback Submission\n==============================\n"
            f"From:    {name}\nEmail:   {email or 'Not provided'}\n"
            f"Subject: {subject}\n\nMessage:\n{message}")

    smtp_host = os.environ.get('SMTP_HOST', '')
    smtp_user = os.environ.get('SMTP_USER', '')
    smtp_pass = os.environ.get('SMTP_PASS', '')
    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart()
            msg['From'] = smtp_user
            msg['To'] = FEEDBACK_EMAIL
            msg['Subject'] = '[SmartAgric Feedback] ' + subject.replace('\n', ' ')
            msg['Reply-To'] = email if email else smtp_user
            msg.attach(MIMEText(body, 'plain'))
            with smtplib.SMTP_SSL(smtp_host, 465) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, FEEDBACK_EMAIL, msg.as_string())
            record.email_delivered = True
            db.session.commit()
        except Exception as e:
            current_app.logger.error('Feedback email failed: %s', type(e).__name__)

    return jsonify({'message': 'Feedback received. Thank you!',
                    'email_delivered': bool(record.email_delivered)}), 200
