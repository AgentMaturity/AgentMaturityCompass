from setuptools import setup, find_packages

setup(
    name="pytest-amc",
    version="1.0.0",
    description="pytest plugin for Agent Maturity Compass scoring",
    author="AMC Team",
    author_email="hello@agentmaturitycompass.com",
    url="https://github.com/AgentMaturity/AgentMaturityCompass",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "pytest>=7.0.0",
    ],
    entry_points={
        "pytest11": [
            "amc = pytest_amc.plugin",
        ]
    },
    classifiers=[
        "Framework :: Pytest",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "License :: OSI Approved :: MIT License",
    ],
    python_requires=">=3.8",
)
