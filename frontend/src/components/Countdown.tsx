import { useState, useEffect } from 'react';

interface CountdownProps {
  deadline: bigint;
  label: string;
}

export function Countdown({ deadline, label }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000); // Current time in seconds
      const deadlineSeconds = Number(deadline);
      const diff = deadlineSeconds - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Expired');
        return;
      }

      setIsExpired(false);

      // Calculate time components
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      // Format the time string
      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <div className="flex flex-col">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-xl font-bold ${isExpired ? 'text-red-400' : 'text-white'}`}>
        {timeLeft}
      </p>
    </div>
  );
}

